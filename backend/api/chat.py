"""对话与 SSE 流式响应端点

POST /api/chat - 接收用户消息，启动/推进图执行，返回 SSE 阶段事件流。

SSE 事件格式:
  event: status
  data: {"node_status": "researching", "message": "..."}

  event: outline
  data: {"outline": "...", "node_status": "outline_review"}

  event: draft
  data: {"draft_answer": "...", "node_status": "answer_review"}

  event: done
  data: {"final_answer": "...", "node_status": "done"}

  event: error
  data: {"error": "...", "node_status": "error"}
"""

import json
import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from graph.retrieval_graph import get_retrieval_graph
from states.retrieval_state import RetrievalState

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    query: str
    thread_id: str


class ChatEvent:
    """SSE 事件辅助类"""

    def __init__(self, event: str, data: dict):
        self.event = event
        self.data = data

    def to_sse(self) -> str:
        return f"event: {self.event}\ndata: {json.dumps(self.data, ensure_ascii=False)}\n\n"


async def _run_graph_stream(query: str, thread_id: str) -> AsyncGenerator[str, None]:
    """异步执行图并产生 SSE 事件流"""
    graph = get_retrieval_graph()
    config = {"configurable": {"thread_id": thread_id}}

    # 初始状态
    initial_state: RetrievalState = {
        "messages": [],
        "query": query,
        "thread_id": thread_id,
        "research_plan": [],
        "retrieved_docs": [],
        "doc_grades": [],
        "rewritten_query": "",
        "rewrite_count": 0,
        "outline": "",
        "outline_approved": False,
        "outline_feedback": "",
        "draft_answer": "",
        "answer_approved": False,
        "answer_feedback": "",
        "final_answer": "",
        "node_status": "researching",
        "needs_human_input": False,
        "error": "",
    }

    try:
        # 发送初始状态
        yield ChatEvent("status", {
            "node_status": "researching",
            "message": f"开始处理查询: {query}",
        }).to_sse()

        # 执行图 (异步，以便在中断时能发送事件)
        # 注意: 需要在后台线程中运行同步的 graph.invoke
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: graph.invoke(initial_state, config)
        )

        # 检查中断状态
        snapshot = graph.get_state(config)

        # 根据当前节点状态发送事件
        node_status = result.get("node_status", "done")

        if node_status == "outline_review":
            yield ChatEvent("outline", {
                "outline": result.get("outline", ""),
                "node_status": "outline_review",
                "message": "大纲已生成，请审核确认",
            }).to_sse()

        elif node_status == "generating":
            # 大纲已确认，正在生成草稿
            yield ChatEvent("status", {
                "node_status": "generating",
                "message": "大纲已确认，正在生成草稿...",
            }).to_sse()

        elif node_status == "answer_review":
            yield ChatEvent("draft", {
                "draft_answer": result.get("draft_answer", ""),
                "node_status": "answer_review",
                "message": "草稿已生成，请审核确认",
            }).to_sse()

        elif node_status == "done":
            yield ChatEvent("done", {
                "final_answer": result.get("final_answer", ""),
                "node_status": "done",
                "message": "答案已生成",
            }).to_sse()

        else:
            # 检查是否有 __interrupt__ 元组
            interrupts = getattr(snapshot, "interrupts", None) if snapshot else None
            if interrupts:
                # 图在中途挂起，需要根据 interrupted node 判断
                interrupted_node = None
                for interrupt_item in interrupts:
                    if hasattr(interrupt_item, 'value') and isinstance(interrupt_item.value, str):
                        interrupted_node = interrupt_item.value
                        break

                if interrupted_node == "generate_outline":
                    state_values = result
                    yield ChatEvent("outline", {
                        "outline": state_values.get("outline", ""),
                        "node_status": "outline_review",
                        "message": "大纲已生成，请审核确认",
                    }).to_sse()
                elif interrupted_node == "generate_draft":
                    state_values = result
                    yield ChatEvent("draft", {
                        "draft_answer": state_values.get("draft_answer", ""),
                        "node_status": "answer_review",
                        "message": "草稿已生成，请审核确认",
                    }).to_sse()
                else:
                    yield ChatEvent("status", {
                        "node_status": result.get("node_status", "researching"),
                        "message": f"图已挂起在: {interrupted_node or 'unknown'}",
                    }).to_sse()
            else:
                yield ChatEvent("status", {
                    "node_status": node_status,
                    "message": f"处理完成: {node_status}",
                }).to_sse()

    except Exception as e:
        yield ChatEvent("error", {
            "error": str(e),
            "node_status": "error",
        }).to_sse()


@router.post("/chat")
async def chat(request: ChatRequest):
    """接收用户消息并返回 SSE 流式响应"""
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="查询不能为空")

    return StreamingResponse(
        _run_graph_stream(request.query, request.thread_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )