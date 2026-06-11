"""人工审核端点 - HITL 中断恢复 / 大纲&答案审批

POST /api/review - 接收审核结果并恢复挂起的图
GET /api/history/{thread_id} - 获取当前状态
"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from graph.retrieval_graph import get_retrieval_graph
from states.retrieval_state import RetrievalState, ReviewDecision

router = APIRouter(prefix="/api", tags=["hitl"])


class ReviewRequest(BaseModel):
    thread_id: str
    stage: str  # "outline" | "answer"
    decision: str  # "approve" | "reject" | "edit"
    feedback: str = ""  # 修改内容或批注


class ReviewResponse(BaseModel):
    success: bool
    node_status: str
    message: str
    data: dict = {}


@router.post("/review", response_model=ReviewResponse)
async def submit_review(request: ReviewRequest):
    """提交人工审核结果并恢复图执行"""
    if request.stage not in ("outline", "answer"):
        raise HTTPException(status_code=400, detail="stage 必须为 'outline' 或 'answer'")

    if request.decision not in ("approve", "reject", "edit"):
        raise HTTPException(status_code=400, detail="decision 必须为 'approve'、'reject' 或 'edit'")

    graph = await get_retrieval_graph()
    config = {"configurable": {"thread_id": request.thread_id}}

    # 检查图状态
    state = await graph.aget_state(config)
    if state is None or state.values is None:
        raise HTTPException(status_code=404, detail="未找到对应的会话状态")

    current_values = state.values

    # 根据审核阶段和决策构建恢复数据
    if request.stage == "outline":
        if request.decision == "approve":
            update = {
                "outline_approved": True,
                "outline_feedback": "",
                "node_status": "generating",
            }
        elif request.decision == "edit":
            update = {
                "outline_approved": False,
                "outline_feedback": request.feedback,
                "node_status": "outline_review",
            }
        else:  # reject
            update = {
                "outline_approved": False,
                "outline_feedback": "",
                "node_status": "researching",
            }
    else:  # answer
        if request.decision == "approve":
            update = {
                "answer_approved": True,
                "answer_feedback": "",
                "node_status": "done",
            }
        elif request.decision == "edit":
            update = {
                "answer_approved": False,
                "answer_feedback": request.feedback,
                "node_status": "answer_review",
            }
        else:  # reject
            update = {
                "answer_approved": False,
                "answer_feedback": "",
                "node_status": "researching",
            }

    try:
        # 更新状态并恢复执行
        await graph.aupdate_state(config, update)

        # 恢复执行 - 使用 None 作为输入 (不添加新输入)
        from langgraph.types import Command
        result = await graph.ainvoke(Command(resume=update), config)

        node_status = result.get("node_status", "done")

        response_data = {}
        if node_status == "outline_review":
            response_data["outline"] = result.get("outline", "")
        elif node_status == "answer_review":
            response_data["draft_answer"] = result.get("draft_answer", "")
        elif node_status == "done":
            response_data["final_answer"] = result.get("final_answer", "")
        elif node_status == "researching":
            response_data["message"] = "正在重新检索..."

        return ReviewResponse(
            success=True,
            node_status=node_status,
            message=f"审核已处理: {request.decision}",
            data=response_data,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"恢复图执行失败: {str(e)}")


@router.get("/history/{thread_id}")
async def get_history(thread_id: str):
    """获取当前会话状态 (用于前端渲染 HITL 组件)"""
    graph = await get_retrieval_graph()
    config = {"configurable": {"thread_id": thread_id}}

    state = await graph.aget_state(config)

    if state is None:
        return {
            "thread_id": thread_id,
            "exists": False,
            "node_status": "not_found",
            "message": "未找到该会话",
        }

    values = state.values or {}

    # 检查是否有中断
    interrupts = getattr(state, "interrupts", None)
    has_interrupt = bool(interrupts)

    return {
        "thread_id": thread_id,
        "exists": True,
        "node_status": values.get("node_status", "unknown"),
        "has_interrupt": has_interrupt,
        "interrupts": [str(i) for i in interrupts] if interrupts else [],
        "outline": values.get("outline", ""),
        "draft_answer": values.get("draft_answer", ""),
        "final_answer": values.get("final_answer", ""),
        "outline_approved": values.get("outline_approved", False),
        "answer_approved": values.get("answer_approved", False),
        "research_plan": values.get("research_plan", []),
        "retrieved_docs": values.get("retrieved_docs", []),
        "doc_grades": values.get("doc_grades", []),
        "hallucination_check": values.get("hallucination_check", {}),
        "error": values.get("error", ""),
    }