"""对话与 SSE 流式响应端点 + 诊断端点

POST /api/chat      - 接收用户消息，启动图执行，返回 token 级 SSE 流
GET  /api/test-sse  - 诊断端点：验证基础 SSE 流是否正常
POST /api/test-graph - 诊断端点：绕过 graph 直接测试 LLM + Embedding + FAISS
"""

import json
import asyncio
import traceback
import time
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel

from graph.retrieval_graph import get_retrieval_graph
from states.retrieval_state import RetrievalState
from llm import get_llm, get_embeddings
from tools.retriever import similarity_search

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


# 节点名 → 用户可读状态映射
_NODE_STATUS_MAP = {
    "classify_query": "classifying",
    "direct_reply": "chitchat",
    "research": "researching",
    "generate_outline": "generating_outline",
    "generate_draft": "generating_draft",
    "finalize": "finalizing",
    "handle_reject": "researching",
}

# 用于追踪当前正在生成内容的节点
# 注意: generate_outline 和 generate_draft 的内容通过 outline/draft 事件发送给审核组件，
# 不作为 token 流追加到消息气泡，避免重复显示
_GENERATING_NODES = {"direct_reply", "finalize"}


async def _run_graph_stream(query: str, thread_id: str) -> AsyncGenerator[str, None]:
    """异步执行图并产生 token 级 SSE 事件流"""
    graph = None
    try:
        graph = await get_retrieval_graph()
        config = {"configurable": {"thread_id": thread_id}}

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
            "hallucination_check": {},
            "final_answer": "",
            "node_status": "researching",
            "is_chitchat": False,
            "needs_human_input": False,
            "error": "",
        }

        # 发送初始状态
        yield ChatEvent("status", {
            "node_status": "researching",
            "message": f"开始处理查询: {query}",
        }).to_sse()

        # 使用 astream_events 获取 token 级流
        current_node = ""
        node_accumulator = {}  # node_name -> accumulated text

        async for event in graph.astream_events(initial_state, config, version="v2"):
            kind = event.get("event", "")
            name = event.get("name", "")
            metadata = event.get("metadata", {})
            data = event.get("data", {})

            # 检测节点切换（on_chain_start 事件）
            if kind == "on_chain_start" and metadata.get("langgraph_node"):
                node_name = metadata["langgraph_node"]
                if node_name != current_node:
                    current_node = node_name
                    status = _NODE_STATUS_MAP.get(node_name, node_name)
                    yield ChatEvent("status", {
                        "node_status": status,
                        "node": node_name,
                        "message": f"进入节点: {node_name}",
                    }).to_sse()

            # 捕获 LLM token 流
            elif kind == "on_chat_model_stream" and current_node in _GENERATING_NODES:
                chunk = data.get("chunk")
                if chunk and hasattr(chunk, "content") and chunk.content:
                    token_text = chunk.content
                    # 累积文本
                    node_accumulator.setdefault(current_node, "")
                    node_accumulator[current_node] += token_text
                    yield ChatEvent("token", {
                        "content": token_text,
                        "node": current_node,
                    }).to_sse()

        # 流结束后，检查状态并发送对应的 SSE 事件
        snapshot = await graph.aget_state(config)
        values = snapshot.values if snapshot else {}
        node_status = values.get("node_status", "done") if values else "done"

        # 以 node_status 为主条件判断当前阶段，发送带完整数据的事件
        if node_status == "outline_review":
            yield ChatEvent("outline", {
                "outline": values.get("outline", ""),
                "node_status": "outline_review",
                "message": "大纲已生成，请审核确认",
            }).to_sse()
        elif node_status == "answer_review":
            yield ChatEvent("draft", {
                "draft_answer": values.get("draft_answer", ""),
                "node_status": "answer_review",
                "hallucination_check": values.get("hallucination_check", {}),
                "message": "草稿已生成，请审核确认",
            }).to_sse()
        elif node_status == "done":
            yield ChatEvent("done", {
                "final_answer": values.get("final_answer", ""),
                "node_status": "done",
                "message": "答案已生成",
            }).to_sse()
        else:
            # 可能仍在处理中或挂起在其他节点
            interrupts = getattr(snapshot, "interrupts", None) if snapshot else None
            yield ChatEvent("status", {
                "node_status": node_status,
                "message": f"处理完成: {node_status}",
                "has_interrupt": bool(interrupts),
            }).to_sse()

    except asyncio.TimeoutError:
        print("[Chat] 图执行超时 (180s)", flush=True)
        yield ChatEvent("error", {
            "error": "图执行超时，请稍后重试",
            "node_status": "error",
        }).to_sse()

    except BaseException as e:
        exc_type = type(e).__name__
        exc_msg = str(e)
        tb = traceback.format_exc()
        print(f"[Chat] 未捕获异常: {exc_type}: {exc_msg}", flush=True)
        print(f"[Chat] Traceback:\n{tb}", flush=True)

        yield ChatEvent("error", {
            "error": f"{exc_type}: {exc_msg}",
            "node_status": "error",
        }).to_sse()


@router.post("/chat")
async def chat(request: ChatRequest):
    """接收用户消息并返回 token 级 SSE 流式响应"""
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


# ═══════════════════════════════════════════════
# 诊断端点
# ═══════════════════════════════════════════════

@router.get("/test-sse")
async def test_sse():
    """诊断端点：验证基础 SSE 流是否正常"""

    async def _test_stream():
        for i in range(3):
            yield ChatEvent("status", {
                "node_status": "testing",
                "message": f"SSE test event {i + 1}/3",
                "timestamp": time.time(),
            }).to_sse()
            await asyncio.sleep(0.5)
        yield ChatEvent("done", {
            "node_status": "done",
            "message": "SSE 测试完成",
        }).to_sse()

    return StreamingResponse(
        _test_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/test-graph")
async def test_graph(request: ChatRequest):
    """诊断端点：绕过 graph，直接测试 LLM + Embedding + FAISS 三个组件"""
    results = {}

    # 1. 测试 LLM
    try:
        llm = get_llm()
        start = time.time()
        resp = llm.invoke("用一句话回答：什么是 LangGraph？")
        elapsed = time.time() - start
        results["llm"] = {
            "ok": True,
            "elapsed_s": round(elapsed, 2),
            "response_preview": resp.content[:200] if hasattr(resp, 'content') else str(resp)[:200],
        }
    except BaseException as e:
        results["llm"] = {
            "ok": False,
            "error": f"{type(e).__name__}: {str(e)}",
        }

    # 2. 测试 Embedding (Ollama)
    try:
        emb = get_embeddings()
        start = time.time()
        vec = emb.embed_query("测试文本")
        elapsed = time.time() - start
        results["embedding"] = {
            "ok": True,
            "elapsed_s": round(elapsed, 2),
            "dimension": len(vec),
        }
    except BaseException as e:
        results["embedding"] = {
            "ok": False,
            "error": f"{type(e).__name__}: {str(e)}",
        }

    # 3. 测试 FAISS 检索
    try:
        from tools.retriever import get_vectorstore
        start = time.time()
        vs = get_vectorstore()
        docstore = vs.docstore
        docs_dict = None
        if hasattr(docstore, "_dict"):
            docs_dict = docstore._dict
        elif hasattr(docstore, "dict"):
            docs_dict = docstore.dict
        total_docs = len(docs_dict) if docs_dict else 0

        # 同时测试检索功能
        docs = similarity_search(request.query, k=3)
        elapsed = time.time() - start
        results["faiss"] = {
            "ok": True,
            "elapsed_s": round(elapsed, 2),
            "doc_count": total_docs,
            "search_hits": len(docs),
            "preview": [d["content"][:80] for d in docs[:2]],
        }
    except BaseException as e:
        results["faiss"] = {
            "ok": False,
            "error": f"{type(e).__name__}: {str(e)}",
        }

    all_ok = all(v.get("ok", False) for v in results.values())
    return JSONResponse({
        "all_ok": all_ok,
        "results": results,
    })
