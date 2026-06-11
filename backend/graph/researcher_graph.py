"""研究员子图 - ReAct 检索循环

Plan → Retrieve → Grade → Rewrite/Decide (最多重试 2 次)
"""

import json
from typing import Literal

from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, AIMessage

from states.researcher_state import ResearcherState
from prompts import RESEARCHER_PLAN_PROMPT, RESEARCHER_REWRITE_PROMPT, DOC_GRADER_PROMPT
from tools.retriever import similarity_search, mmr_search
from llm import get_llm
from config import settings


# ═══════════════════════════════════════════════
# 节点函数
# ═══════════════════════════════════════════════

def plan_node(state: ResearcherState) -> dict:
    """Step 1 - Plan: 根据用户查询生成多个并行检索查询"""
    query = state.get("rewritten_query") or state["query"]
    rewrite_count = state.get("rewrite_count", 0)

    if rewrite_count > 0:
        # 使用改写 prompt
        previous_queries = state.get("search_queries", [])
        prompt = RESEARCHER_REWRITE_PROMPT.format(
            original_query=state["query"],
            previous_queries="\n".join(previous_queries),
            rewrite_count=rewrite_count,
            max_rewrites=settings.max_rewrite_attempts,
            max_queries=settings.max_search_queries,
        )
    else:
        # 首次查询规划
        prompt = RESEARCHER_PLAN_PROMPT.format(
            query=query,
            max_queries=settings.max_search_queries,
        )

    llm = get_llm()
    response = llm.invoke([HumanMessage(content=prompt)])

    # 解析查询列表
    search_queries = [
        line.strip()
        for line in response.content.strip().split("\n")
        if line.strip()
    ]

    # 限制数量
    search_queries = search_queries[:settings.max_search_queries]

    return {
        "search_queries": search_queries,
        "messages": [
            HumanMessage(content=f"Planning queries for: {query}"),
            AIMessage(content=f"Generated queries: {search_queries}"),
        ],
    }


def retrieve_node(state: ResearcherState) -> dict:
    """Step 2 - Retrieve: 并行从 FAISS 检索文档"""
    search_queries = state.get("search_queries", [state["query"]])

    all_docs = []
    seen_contents = set()

    for sq in search_queries:
        # 使用 MMR 检索以获得更好的多样性
        docs = mmr_search(sq, k=settings.top_k_retrieval)
        for doc in docs:
            # 去重
            content_key = doc["content"][:100]
            if content_key not in seen_contents:
                seen_contents.add(content_key)
                all_docs.append(doc)

    return {
        "retrieved_docs": all_docs,
        "messages": [
            AIMessage(content=f"Retrieved {len(all_docs)} unique documents from {len(search_queries)} queries"),
        ],
    }


def grade_node(state: ResearcherState) -> dict:
    """Step 3 - Grade: 使用 LLM 对每个文档进行相关性打分"""
    retrieved_docs = state.get("retrieved_docs", [])
    query = state.get("rewritten_query") or state["query"]

    if not retrieved_docs:
        return {"doc_grades": []}

    llm = get_llm()
    grades = []

    for i, doc in enumerate(retrieved_docs):
        prompt = DOC_GRADER_PROMPT.format(
            query=query,
            document=doc["content"][:2000],  # 截断过长文档
        )

        try:
            response = llm.invoke([HumanMessage(content=prompt)])
            result = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            grades.append({
                "index": i,
                "grade": result.get("grade", "irrelevant"),
                "reason": result.get("reason", ""),
            })
        except Exception:
            # 解析失败时默认为 irrelevant
            grades.append({
                "index": i,
                "grade": "irrelevant",
                "reason": "LLM 评分解析失败",
            })

    relevant_count = sum(1 for g in grades if g["grade"] in ("relevant", "partial"))

    return {
        "doc_grades": grades,
        "messages": [
            AIMessage(content=f"Graded {len(grades)} documents: {relevant_count} relevant/partial"),
        ],
    }


def rewrite_node(state: ResearcherState) -> dict:
    """Step 4a - Rewrite: 改写查询 (当所有文档都不相关)"""
    # 增加改写计数
    new_count = state.get("rewrite_count", 0) + 1

    return {
        "rewrite_count": new_count,
        "rewritten_query": "",  # 实际改写逻辑在 plan_node 中根据 rewrite_count 判断
        "research_done": False,
        "messages": [
            AIMessage(content=f"All documents irrelevant. Rewriting query (attempt {new_count}/{settings.max_rewrite_attempts})..."),
        ],
    }


def finalize_node(state: ResearcherState) -> dict:
    """Step 4b - Finalize: 过滤相关文档并标记完成"""
    grades = state.get("doc_grades", [])
    docs = state.get("retrieved_docs", [])

    # 过滤出相关和部分相关的文档
    relevant_docs = [
        docs[g["index"]]
        for g in grades
        if g["grade"] in ("relevant", "partial") and g["index"] < len(docs)
    ]

    return {
        "retrieved_docs": relevant_docs,
        "research_done": True,
        "messages": [
            AIMessage(content=f"Research complete. Found {len(relevant_docs)} relevant documents."),
        ],
    }


# ═══════════════════════════════════════════════
# 条件边逻辑
# ═══════════════════════════════════════════════

def decide_after_grade(state: ResearcherState) -> Literal["rewrite", "finalize"]:
    """判断打分后的走向:
    - 如果所有文档都 irrelevant 且改写次数未达上限 → rewrite
    - 否则 → finalize
    """
    grades = state.get("doc_grades", [])
    rewrite_count = state.get("rewrite_count", 0)

    # 检查是否有相关文档
    has_relevant = any(g["grade"] in ("relevant", "partial") for g in grades)

    if not has_relevant and rewrite_count < settings.max_rewrite_attempts:
        return "rewrite"
    return "finalize"


def decide_after_rewrite(state: ResearcherState) -> Literal["plan", "finalize"]:
    """改写后判断是否继续循环:
    - 如果未达上限 → plan (重新开始)
    - 已达上限 → finalize (强制结束)
    """
    if state.get("rewrite_count", 0) < settings.max_rewrite_attempts:
        return "plan"
    return "finalize"


# ═══════════════════════════════════════════════
# 构建研究员子图
# ═══════════════════════════════════════════════

def build_researcher_graph() -> StateGraph:
    """构建并编译研究员子图 (ReAct 循环)"""
    builder = StateGraph(ResearcherState)

    # 添加节点
    builder.add_node("plan", plan_node)
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("grade", grade_node)
    builder.add_node("rewrite", rewrite_node)
    builder.add_node("finalize", finalize_node)

    # 设置入口
    builder.set_entry_point("plan")

    # 固定边
    builder.add_edge("plan", "retrieve")
    builder.add_edge("retrieve", "grade")

    # 条件边: 打分后决定去向
    builder.add_conditional_edges(
        "grade",
        decide_after_grade,
        {
            "rewrite": "rewrite",
            "finalize": "finalize",
        },
    )

    # 条件边: 改写后决定是否继续循环
    builder.add_conditional_edges(
        "rewrite",
        decide_after_rewrite,
        {
            "plan": "plan",
            "finalize": "finalize",
        },
    )

    # 终点
    builder.add_edge("finalize", END)

    return builder.compile()


# 全局研究员子图实例
researcher_graph = build_researcher_graph()