"""检索主图 - 整合 Researcher 子图 + HITL 大纲确认 + 草稿生成 + HITL 结论确认

数据流:
  START → research (子图) → generate_outline → [HITL 挂起] → generate_draft → [HITL 挂起] → finalize → END
"""

import json
from typing import Literal
from pathlib import Path

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_core.messages import HumanMessage, AIMessage

from states.retrieval_state import RetrievalState
from states.researcher_state import ResearcherState
from prompts import (
    OUTLINE_GENERATOR_PROMPT,
    ANSWER_GENERATOR_PROMPT,
    OUTLINE_REVISION_PROMPT,
    HALLUCINATION_GRADER_PROMPT,
)
from graph.researcher_graph import researcher_graph
from llm import get_llm
from config import settings


# ═══════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════

def _format_docs_for_prompt(docs: list[dict]) -> str:
    """将检索文档格式化为 Prompt 可用的文本"""
    if not docs:
        return "（无相关文档）"

    parts = []
    for i, doc in enumerate(docs):
        title = doc.get("metadata", {}).get("title", f"文档{i+1}")
        parts.append(f"[文档{i+1}] {title}\n{doc['content']}\n")

    return "\n---\n".join(parts)


def _get_checkpointer():
    """获取 SQLite Checkpointer"""
    db_path = settings.checkpointer_db_path
    # 确保父目录存在
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    return SqliteSaver.from_conn_string(db_path)


# ═══════════════════════════════════════════════
# 节点函数
# ═══════════════════════════════════════════════

def research_node(state: RetrievalState) -> dict:
    """调用 Researcher 子图执行 ReAct 检索循环"""
    # 映射主图状态 → 子图状态
    researcher_input: ResearcherState = {
        "query": state["query"],
        "messages": [],
        "search_queries": [],
        "retrieved_docs": [],
        "doc_grades": [],
        "rewritten_query": "",
        "rewrite_count": 0,
        "research_done": False,
    }

    result = researcher_graph.invoke(researcher_input)

    # 子图输出映射回主图
    return {
        "research_plan": result.get("search_queries", []),
        "retrieved_docs": result.get("retrieved_docs", []),
        "doc_grades": result.get("doc_grades", []),
        "rewritten_query": result.get("rewritten_query", ""),
        "rewrite_count": result.get("rewrite_count", 0),
        "node_status": "outline_review",
        "needs_human_input": True,
        "messages": [
            AIMessage(content=f"检索完成，找到 {len(result.get('retrieved_docs', []))} 个相关文档，正在生成大纲..."),
        ],
    }


def generate_outline_node(state: RetrievalState) -> dict:
    """生成答案大纲 (此节点前会通过 interrupt_before 挂起)"""
    docs = state.get("retrieved_docs", [])
    query = state["query"]

    # 检查是否有人工反馈 (编辑/修改)
    feedback = state.get("outline_feedback", "")
    current_outline = state.get("outline", "")

    if feedback and current_outline:
        # 根据人工反馈修订大纲
        prompt = OUTLINE_REVISION_PROMPT.format(
            original_outline=current_outline,
            feedback=feedback,
            documents=_format_docs_for_prompt(docs),
        )
        action = "revised"
    else:
        # 首次生成大纲
        prompt = OUTLINE_GENERATOR_PROMPT.format(
            query=query,
            documents=_format_docs_for_prompt(docs),
        )
        action = "generated"

    llm = get_llm()
    response = llm.invoke([HumanMessage(content=prompt)])

    return {
        "outline": response.content.strip(),
        "outline_feedback": "",  # 清除反馈
        "node_status": "generating",
        "needs_human_input": False,  # 生成完成后等待前端调用 review 确认
        "messages": [
            AIMessage(content=f"大纲已{action}，请审核确认"),
        ],
    }


def generate_draft_node(state: RetrievalState) -> dict:
    """生成草稿答案 (此节点前会通过 interrupt_before 挂起)"""
    docs = state.get("retrieved_docs", [])
    query = state["query"]
    outline = state.get("outline", "")

    # 检查是否有人工反馈
    feedback = state.get("answer_feedback", "")

    if feedback:
        # 带反馈重新生成 (简化处理: 将反馈作为补充要求)
        prompt = ANSWER_GENERATOR_PROMPT.format(
            query=query,
            outline=outline,
            documents=_format_docs_for_prompt(docs),
        )
        prompt += f"\n\n用户反馈要求: {feedback}\n请根据反馈修改答案。"

        # 也进行幻觉检测
        llm = get_llm()
        response = llm.invoke([HumanMessage(content=prompt)])
        draft = response.content.strip()

        # 幻觉检测
        hallucination_check = _check_hallucination(draft, docs)

        return {
            "draft_answer": draft,
            "answer_feedback": "",
            "node_status": "answer_review",
            "needs_human_input": True,
            "messages": [
                AIMessage(content=f"草稿已根据反馈重新生成。幻觉检测: {hallucination_check.get('grade', 'unknown')}"),
            ],
        }

    # 首次生成草稿
    prompt = ANSWER_GENERATOR_PROMPT.format(
        query=query,
        outline=outline,
        documents=_format_docs_for_prompt(docs),
    )

    llm = get_llm()
    response = llm.invoke([HumanMessage(content=prompt)])
    draft = response.content.strip()

    # 幻觉检测
    hallucination_check = _check_hallucination(draft, docs)

    return {
        "draft_answer": draft,
        "node_status": "answer_review",
        "needs_human_input": True,
        "messages": [
            AIMessage(content=f"草稿已生成。幻觉检测: {hallucination_check.get('grade', 'unknown')}"),
        ],
    }


def finalize_node(state: RetrievalState) -> dict:
    """最终确认，输出最终答案"""
    return {
        "final_answer": state["draft_answer"],
        "node_status": "done",
        "needs_human_input": False,
        "messages": [
            AIMessage(content="答案已确认输出"),
        ],
    }


def handle_reject_node(state: RetrievalState) -> dict:
    """处理用户打回重做"""
    # 清除之前的草稿和大纲，重新开始研究
    return {
        "outline": "",
        "draft_answer": "",
        "final_answer": "",
        "outline_approved": False,
        "answer_approved": False,
        "outline_feedback": "",
        "answer_feedback": "",
        "node_status": "researching",
        "needs_human_input": False,
        "messages": [
            HumanMessage(content="用户要求重新检索和生成"),
        ],
    }


# ═══════════════════════════════════════════════
# 幻觉检测
# ═══════════════════════════════════════════════

def _check_hallucination(answer: str, docs: list[dict]) -> dict:
    """检查生成的答案是否忠实于文档"""
    try:
        llm = get_llm()
        prompt = HALLUCINATION_GRADER_PROMPT.format(
            answer=answer[:3000],
            documents=_format_docs_for_prompt(docs)[:4000],
        )
        response = llm.invoke([HumanMessage(content=prompt)])
        return json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
    except Exception:
        return {"grade": "unknown", "reason": "幻觉检测失败"}


# ═══════════════════════════════════════════════
# 条件边逻辑
# ═══════════════════════════════════════════════

def decide_after_outline(state: RetrievalState) -> Literal["generate_draft", "generate_outline", "handle_reject"]:
    """大纲确认后的路由:
    - approved → generate_draft
    - edit → generate_outline (重新生成)
    - reject → handle_reject (打回重做)
    """
    approved = state.get("outline_approved", False)
    feedback = state.get("outline_feedback", "")

    if approved and not feedback:
        return "generate_draft"
    elif feedback and not approved:
        # 编辑模式: 有反馈但未批准，修订大纲
        return "generate_outline"
    else:
        # 打回
        return "handle_reject"


def decide_after_answer(state: RetrievalState) -> Literal["finalize", "generate_draft", "handle_reject"]:
    """答案审核后的路由:
    - approved → finalize
    - edit → generate_draft (带反馈重新生成)
    - reject → handle_reject
    """
    approved = state.get("answer_approved", False)
    feedback = state.get("answer_feedback", "")

    if approved:
        return "finalize"
    elif feedback and not approved:
        return "generate_draft"
    else:
        return "handle_reject"


def decide_after_handle_reject(state: RetrievalState) -> Literal["research", "generate_outline"]:
    """打回后: 重新从研究开始"""
    return "research"


# ═══════════════════════════════════════════════
# 构建检索主图
# ═══════════════════════════════════════════════

def build_retrieval_graph() -> StateGraph:
    """构建检索主图 (含 HITL 中断点)"""
    builder = StateGraph(RetrievalState)

    # 添加节点
    builder.add_node("research", research_node)
    builder.add_node("generate_outline", generate_outline_node)
    builder.add_node("generate_draft", generate_draft_node)
    builder.add_node("finalize", finalize_node)
    builder.add_node("handle_reject", handle_reject_node)

    # 设置入口
    builder.set_entry_point("research")

    # 固定边
    builder.add_edge("research", "generate_outline")

    # generate_outline → 条件路由 (大纲审核结果)
    builder.add_conditional_edges(
        "generate_outline",
        decide_after_outline,
        {
            "generate_draft": "generate_draft",
            "generate_outline": "generate_outline",
            "handle_reject": "handle_reject",
        },
    )

    # generate_draft → 条件路由 (答案审核结果)
    builder.add_conditional_edges(
        "generate_draft",
        decide_after_answer,
        {
            "finalize": "finalize",
            "generate_draft": "generate_draft",
            "handle_reject": "handle_reject",
        },
    )

    # handle_reject → 重新研究
    builder.add_edge("handle_reject", "research")

    # 终点
    builder.add_edge("finalize", END)

    # 编译图，带 Checkpointer + HITL 中断点
    checkpointer = _get_checkpointer()
    graph = builder.compile(
        checkpointer=checkpointer,
        # 在大纲生成和草稿生成之前挂起，等待人工确认
        interrupt_before=["generate_outline", "generate_draft"],
    )

    return graph


# ═══════════════════════════════════════════════
# 全局图实例 (延迟初始化，避免模块加载时连接数据库)
# ═══════════════════════════════════════════════

_retrieval_graph = None


def get_retrieval_graph():
    """获取检索主图实例 (懒加载)"""
    global _retrieval_graph
    if _retrieval_graph is None:
        _retrieval_graph = build_retrieval_graph()
    return _retrieval_graph