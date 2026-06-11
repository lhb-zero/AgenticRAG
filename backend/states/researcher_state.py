"""研究员子图状态定义 - ReAct 检索循环"""

from typing import Annotated, TypedDict, Literal
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage


class ResearcherState(TypedDict):
    """研究员子图内部状态

    在 Plan → Retrieve → Grade → Rewrite/Decide 循环中流转。
    """

    # 从主图传入的原始用户查询
    query: str

    # 子图内部的对话历史 (用于 ReAct 推理)
    messages: Annotated[list[BaseMessage], add_messages]

    # 研究员生成的多个并行检索查询
    search_queries: list[str]

    # 检索到的文档列表 (每个元素为 dict: {content, metadata, score})
    retrieved_docs: list[dict]

    # 文档相关性打分结果
    # 结构与 retrieved_docs 一一对应
    # 每个元素: {"index": int, "grade": "relevant"|"irrelevant"|"partial", "reason": str}
    doc_grades: list[dict]

    # 改写后的查询 (当所有文档都不相关时触发改写)
    rewritten_query: str

    # 改写重试计数 (最多 2 次)
    rewrite_count: int

    # 研究员循环是否完成
    research_done: bool


# 文档相关性等级
DocGrade = Literal["relevant", "irrelevant", "partial"]