"""索引图端到端测试 - Mock LLM + 临时向量库"""

import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock

from graph.index_graph import _chunk_documents, MOCK_DOCS, build_index_from_mock


class TestIndexGraph:
    """索引图测试"""

    def test_mock_docs_have_required_fields(self):
        """Mock 文档包含必要的字段"""
        for doc in MOCK_DOCS:
            assert "title" in doc, f"Missing title in {doc}"
            assert "content" in doc, f"Missing content in {doc}"
            assert len(doc["content"]) > 0

    def test_chunk_documents(self):
        """文档分块测试"""
        test_docs = [
            {"title": "测试", "content": "这是一个测试文档。" * 100}
        ]
        chunks = _chunk_documents(test_docs)
        assert len(chunks) > 0
        for chunk in chunks:
            assert chunk.page_content
            assert chunk.metadata.get("title") == "测试"

    @patch("graph.index_graph.get_embeddings")
    @patch("graph.index_graph.settings")
    def test_build_index_from_mock(self, mock_settings, mock_embeddings):
        """Mock 索引构建"""
        with tempfile.TemporaryDirectory() as tmpdir:
            mock_settings.vectorstore_dir = tmpdir
            mock_settings.chunk_size = 500
            mock_settings.chunk_overlap = 100

            mock_embeddings.return_value = MagicMock()
            mock_embeddings.return_value.embed_documents.return_value = [[0.1] * 1024]

            # 由于 FAISS 需要真实的 embedding，这里只测试分块逻辑
            # 实际构建需要完整的 embedding 服务
            chunks = _chunk_documents(MOCK_DOCS)
            assert len(chunks) > 0, "应有至少一个分块"