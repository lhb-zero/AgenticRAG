"""检索主图状态定义 - 含 HITL 中断信号"""

from typing import Annotated, TypedDict, Literal
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class RetrievalState(TypedDict):
    """检索主图全局状态

    贯穿整个检索 → 大纲确认(HITL) → 生成草稿 → 结论确认(HITL) 流程。
    node_status 字段用于前端判断当前处于哪个阶段。
    """

    # ── 对话上下文 ──
    messages: Annotated[list[BaseMessage], add_messages]

    # ── 用户输入 ──
    query: str
    thread_id: str

    # ── 研究员子图输出 ──
    research_plan: list[str]          # 研究员生成的检索计划/查询列表
    retrieved_docs: list[dict]        # 最终返回的相关文档
    doc_grades: list[dict]            # 文档打分
    rewritten_query: str              # 改写后的查询 (若触发过改写)
    rewrite_count: int                # 改写次数

    # ── 大纲生成 & HITL ──
    outline: str                      # 生成的大纲
    outline_approved: bool            # 人工是否批准大纲
    outline_feedback: str             # 人工对大纲的修改/批注

    # ── 草稿答案 & HITL ──
    draft_answer: str                 # 生成的草稿答案
    answer_approved: bool             # 人工是否批准答案
    answer_feedback: str              # 人工对答案的修改/批注

    # ── 幻觉检测 ──
    hallucination_check: dict          # {"grade": "faithful|hallucinated", "reason": "..."}

    # ── 最终输出 ──
    final_answer: str

    # ── 流程控制 ──
    # 当前所处阶段: "researching" | "outline_review" | "generating" | "answer_review" | "done" | "chitchat"
    node_status: str

    # 闲聊标记（分类器设置）
    is_chitchat: bool

    # 是否需要挂起等待人工确认
    needs_human_input: bool

    # 错误信息
    error: str


# HITL 审核决策
ReviewDecision = Literal["approve", "reject", "edit"]