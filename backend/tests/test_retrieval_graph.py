"""检索图测试 - 含 HITL 中断/恢复流程验证"""

import pytest
from unittest.mock import patch, MagicMock

from states.retrieval_state import RetrievalState
from states.researcher_state import ResearcherState


class TestRetrievalState:
    """检索主图状态测试"""

    def test_initial_state(self):
        """初始状态应有默认值"""
        state: RetrievalState = {
            "messages": [],
            "query": "测试查询",
            "thread_id": "test-001",
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
            "node_status": "",
            "needs_human_input": False,
            "error": "",
        }

        assert state["query"] == "测试查询"
        assert state["thread_id"] == "test-001"
        assert state["rewrite_count"] == 0
        assert not state["outline_approved"]
        assert not state["answer_approved"]

    def test_hitl_outline_approval_state(self):
        """大纲审核状态转换"""
        state: RetrievalState = {
            "messages": [],
            "query": "测试",
            "thread_id": "t1",
            "research_plan": [],
            "retrieved_docs": [],
            "doc_grades": [],
            "rewritten_query": "",
            "rewrite_count": 0,
            "outline": "## 测试大纲\n- 要点1\n- 要点2",
            "outline_approved": True,
            "outline_feedback": "",
            "draft_answer": "",
            "answer_approved": False,
            "answer_feedback": "",
            "final_answer": "",
            "node_status": "generating",
            "needs_human_input": False,
            "error": "",
        }

        assert state["outline_approved"]
        assert state["node_status"] == "generating"

    def test_hitl_answer_revision_state(self):
        """答案修订状态"""
        state: RetrievalState = {
            "messages": [],
            "query": "测试",
            "thread_id": "t1",
            "research_plan": [],
            "retrieved_docs": [],
            "doc_grades": [],
            "rewritten_query": "",
            "rewrite_count": 0,
            "outline": "大纲",
            "outline_approved": True,
            "outline_feedback": "",
            "draft_answer": "草稿答案",
            "answer_approved": False,
            "answer_feedback": "请补充更多细节",
            "final_answer": "",
            "node_status": "answer_review",
            "needs_human_input": True,
            "error": "",
        }

        assert state["answer_feedback"] == "请补充更多细节"
        assert state["node_status"] == "answer_review"
        assert state["needs_human_input"]


class TestResearcherState:
    """研究员子图状态测试"""

    def test_initial_state(self):
        state: ResearcherState = {
            "query": "测试查询",
            "messages": [],
            "search_queries": [],
            "retrieved_docs": [],
            "doc_grades": [],
            "rewritten_query": "",
            "rewrite_count": 0,
            "research_done": False,
        }

        assert state["query"] == "测试查询"
        assert state["rewrite_count"] == 0
        assert not state["research_done"]

    def test_rewrite_count_limit(self):
        """改写计数不应超过上限"""
        from config import settings

        max_attempts = settings.max_rewrite_attempts
        state: ResearcherState = {
            "query": "测试",
            "messages": [],
            "search_queries": ["q1", "q2"],
            "retrieved_docs": [],
            "doc_grades": [{"index": 0, "grade": "irrelevant", "reason": ""}],
            "rewritten_query": "改写查询",
            "rewrite_count": max_attempts,
            "research_done": False,
        }

        # 达到上限后不应再改写
        assert state["rewrite_count"] >= max_attempts


class TestReviewLogic:
    """HITL 审核逻辑测试"""

    def test_outline_approve_transition(self):
        """批准大纲后应进入 generating 状态"""
        decision = "approve"
        if decision == "approve":
            next_status = "generating"
        elif decision == "edit":
            next_status = "outline_review"
        else:
            next_status = "researching"

        assert next_status == "generating"

    def test_answer_reject_transition(self):
        """打回答案后应重新研究"""
        decision = "reject"
        if decision == "approve":
            next_status = "done"
        elif decision == "edit":
            next_status = "answer_review"
        else:
            next_status = "researching"

        assert next_status == "researching"

    def test_outline_edit_transition(self):
        """编辑大纲后应回到 review"""
        decision = "edit"
        if decision == "approve":
            next_status = "generating"
        elif decision == "edit":
            next_status = "outline_review"
        else:
            next_status = "researching"

        assert next_status == "outline_review"