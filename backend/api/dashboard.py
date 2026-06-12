"""管理仪表盘 API

统计 / 文档管理 / 会话管理 / 链路追踪 / 配置管理
"""

import os
import sqlite3
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# ═══════════════════════════════════════════════
# 统计
# ═══════════════════════════════════════════════

@router.get("/stats")
async def get_stats():
    """聚合统计：向量库 + 会话 + 索引文件"""
    stats = {}

    try:
        from tools.retriever import get_vectorstore
        vs = get_vectorstore()
        docstore = vs.docstore
        total_docs = 0
        doc_titles = Counter()

        docs_dict = None
        if hasattr(docstore, "_dict"):
            docs_dict = docstore._dict
        elif hasattr(docstore, "dict"):
            docs_dict = docstore.dict

        if docs_dict:
            total_docs = len(docs_dict)
            for doc in docs_dict.values():
                if hasattr(doc, "metadata"):
                    title = doc.metadata.get("title", "unknown")
                    doc_titles[title] += 1

        stats["vectorstore"] = {
            "total_chunks": total_docs,
            "unique_documents": len(doc_titles),
            "documents": [
                {"title": title, "chunks": count}
                for title, count in doc_titles.most_common()
            ],
        }
    except Exception as e:
        stats["vectorstore"] = {"error": str(e)}

    try:
        faiss_path = Path(settings.vectorstore_dir) / "index.faiss"
        pkl_path = Path(settings.vectorstore_dir) / "index.pkl"
        stats["index_files"] = {
            "faiss_size_kb": round(faiss_path.stat().st_size / 1024, 1) if faiss_path.exists() else 0,
            "pkl_size_kb": round(pkl_path.stat().st_size / 1024, 1) if pkl_path.exists() else 0,
        }
    except Exception as e:
        stats["index_files"] = {"error": str(e)}

    try:
        sessions = await _list_sessions_from_graph()
        active_count = sum(1 for s in sessions if s.get("has_interrupt"))
        stats["sessions"] = {"total": len(sessions), "active": active_count}
    except Exception as e:
        stats["sessions"] = {"error": str(e)}

    stats["config"] = {
        "llm_model": settings.deepseek_model,
        "embedding_provider": settings.embedding_provider,
        "embedding_model": settings.ollama_embedding_model,
        "chunk_size": settings.chunk_size,
        "chunk_overlap": settings.chunk_overlap,
        "top_k": settings.top_k_retrieval,
        "max_rewrite_attempts": settings.max_rewrite_attempts,
    }

    return stats


# ═══════════════════════════════════════════════
# 文档管理
# ═══════════════════════════════════════════════

@router.get("/documents")
async def list_documents():
    try:
        from tools.retriever import get_vectorstore
        vs = get_vectorstore()
        docstore = vs.docstore
        doc_info = {}

        docs_dict = None
        if hasattr(docstore, "_dict"):
            docs_dict = docstore._dict
        elif hasattr(docstore, "dict"):
            docs_dict = docstore.dict

        if docs_dict:
            for doc in docs_dict.values():
                if not hasattr(doc, "metadata"):
                    continue
                title = doc.metadata.get("title", "unknown")
                source = doc.metadata.get("source", "")
                if title not in doc_info:
                    doc_info[title] = {"title": title, "source": source, "chunks": 0, "sample": doc.page_content[:200]}
                doc_info[title]["chunks"] += 1

        return {"documents": list(doc_info.values()), "total_chunks": sum(d["chunks"] for d in doc_info.values())}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取文档列表失败: {str(e)}")


@router.get("/documents/chunks")
async def get_document_chunks(title: str):
    """获取指定文档的所有分块 — title 通过 query param 传递，避免特殊字符破坏路由"""
    try:
        from tools.retriever import get_vectorstore
        vs = get_vectorstore()
        docstore = vs.docstore

        docs_dict = None
        if hasattr(docstore, "_dict"):
            docs_dict = docstore._dict
        elif hasattr(docstore, "dict"):
            docs_dict = docstore.dict

        if not docs_dict:
            raise HTTPException(status_code=404, detail="文档存储为空")

        chunks = []
        for doc in docs_dict.values():
            if not hasattr(doc, "metadata"):
                continue
            if doc.metadata.get("title", "unknown") == title:
                chunks.append({"content": doc.page_content, "metadata": doc.metadata, "length": len(doc.page_content)})

        if not chunks:
            raise HTTPException(status_code=404, detail=f"未找到文档: {title}")

        return {"title": title, "chunks": chunks, "total": len(chunks)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取分块失败: {str(e)}")


@router.delete("/documents")
async def delete_document(title: str):
    try:
        from tools.retriever import get_vectorstore, reset_vectorstore, build_vectorstore
        from langchain_community.docstore.document import Document

        vs = get_vectorstore()
        docstore = vs.docstore

        docs_dict = None
        if hasattr(docstore, "_dict"):
            docs_dict = docstore._dict
        elif hasattr(docstore, "dict"):
            docs_dict = docstore.dict

        if not docs_dict:
            raise HTTPException(status_code=404, detail="文档存储为空")

        remaining_docs = []
        deleted_count = 0
        for doc in docs_dict.values():
            if not hasattr(doc, "metadata"):
                remaining_docs.append(doc)
                continue
            if doc.metadata.get("title", "unknown") == title:
                deleted_count += 1
            else:
                remaining_docs.append(doc)

        if deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"未找到文档: {title}")
        if not remaining_docs:
            raise HTTPException(status_code=400, detail="不能删除所有文档")

        build_vectorstore(remaining_docs)
        reset_vectorstore()

        return {"success": True, "deleted_chunks": deleted_count, "remaining_chunks": len(remaining_docs)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}")


# ═══════════════════════════════════════════════
# 会话管理
# ═══════════════════════════════════════════════

def _get_db_connection():
    db_path = settings.checkpointer_db_path
    if not os.path.exists(db_path):
        return None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


async def _list_sessions_from_graph() -> list[dict]:
    """通过 LangGraph 异步 API 读取会话列表，正确反序列化 checkpoint"""
    try:
        from graph.retrieval_graph import get_retrieval_graph
        graph = await get_retrieval_graph()

        # 先从 SQLite 读取所有 thread_id
        conn = _get_db_connection()
        if conn is None:
            return []
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            if "checkpoints" not in tables:
                return []
            cursor.execute("SELECT DISTINCT thread_id FROM checkpoints")
            thread_ids = [row[0] for row in cursor.fetchall()]
        finally:
            conn.close()

        # 用 LangGraph API 正确读取每个会话的状态
        sessions = []
        for tid in thread_ids:
            config = {"configurable": {"thread_id": tid}}
            try:
                state = await graph.aget_state(config)
                if state and state.values:
                    values = state.values
                    interrupts = getattr(state, "interrupts", None)
                    sessions.append({
                        "thread_id": tid,
                        "node_status": values.get("node_status", "unknown"),
                        "query": values.get("query", ""),
                        "has_interrupt": bool(interrupts),
                    })
                else:
                    sessions.append({
                        "thread_id": tid,
                        "node_status": "unknown",
                        "query": "",
                        "has_interrupt": False,
                    })
            except Exception:
                sessions.append({
                    "thread_id": tid,
                    "node_status": "unknown",
                    "query": "",
                    "has_interrupt": False,
                })
        return sessions
    except Exception as e:
        print(f"[Dashboard] 读取会话列表失败: {e}")
        return []


@router.get("/sessions")
async def list_sessions():
    try:
        sessions = await _list_sessions_from_graph()
        return {"sessions": sessions, "total": len(sessions)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取会话列表失败: {str(e)}")


@router.delete("/sessions/{thread_id}")
async def delete_session(thread_id: str):
    conn = _get_db_connection()
    if conn is None:
        raise HTTPException(status_code=404, detail="数据库不存在")
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
        deleted = cursor.rowcount
        conn.commit()
        if deleted == 0:
            raise HTTPException(status_code=404, detail=f"未找到会话: {thread_id}")
        return {"success": True, "deleted_checkpoints": deleted}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除会话失败: {str(e)}")
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# 链路追踪
# ═══════════════════════════════════════════════

@router.get("/trace/{thread_id}")
async def get_trace(thread_id: str):
    try:
        from graph.retrieval_graph import get_retrieval_graph
        graph = await get_retrieval_graph()
        config = {"configurable": {"thread_id": thread_id}}

        state = await graph.aget_state(config)
        if state is None or state.values is None:
            raise HTTPException(status_code=404, detail="未找到该会话")

        values = state.values
        interrupts = getattr(state, "interrupts", None)

        history = []
        try:
            async for step in graph.aget_state_history(config):
                step_values = step.values if hasattr(step, "values") and step.values else {}
                history.append({
                    "node_status": step_values.get("node_status", "unknown"),
                    "query": step_values.get("query", ""),
                    "outline": step_values.get("outline", ""),
                    "draft_answer": step_values.get("draft_answer", "")[:200] if step_values.get("draft_answer") else "",
                    "research_plan": step_values.get("research_plan", []),
                    "doc_grades": step_values.get("doc_grades", []),
                    "hallucination_check": step_values.get("hallucination_check", {}),
                })
        except Exception:
            pass

        return {
            "thread_id": thread_id,
            "current_status": values.get("node_status", "unknown"),
            "query": values.get("query", ""),
            "research_plan": values.get("research_plan", []),
            "retrieved_docs": values.get("retrieved_docs", []),
            "doc_grades": values.get("doc_grades", []),
            "outline": values.get("outline", ""),
            "draft_answer": values.get("draft_answer", ""),
            "final_answer": values.get("final_answer", ""),
            "hallucination_check": values.get("hallucination_check", {}),
            "has_interrupt": bool(interrupts),
            "history": history,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取链路失败: {str(e)}")


# ═══════════════════════════════════════════════
# 配置管理 — 模型切换 + 运行参数
# ═══════════════════════════════════════════════

# DeepSeek 可用模型列表
_DEEPSEEK_MODELS = [
    {"id": "deepseek-v4-flash", "name": "DeepSeek V4 Flash", "desc": "快速推理，性价比高"},
    {"id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro", "desc": "更强推理能力"},
]


class ModelSwitch(BaseModel):
    model: str


class ParamsUpdate(BaseModel):
    deepseek_temperature: float | None = None
    deepseek_max_tokens: int | None = None
    chunk_size: int | None = None
    chunk_overlap: int | None = None
    top_k_retrieval: int | None = None
    max_rewrite_attempts: int | None = None
    max_search_queries: int | None = None


@router.get("/config")
async def get_config():
    """获取当前配置：模型列表 + 运行参数"""
    return {
        "models": _DEEPSEEK_MODELS,
        "current_model": settings.deepseek_model,
        "params": {
            "deepseek_temperature": settings.deepseek_temperature,
            "deepseek_max_tokens": settings.deepseek_max_tokens,
            "chunk_size": settings.chunk_size,
            "chunk_overlap": settings.chunk_overlap,
            "top_k_retrieval": settings.top_k_retrieval,
            "max_rewrite_attempts": settings.max_rewrite_attempts,
            "max_search_queries": settings.max_search_queries,
        },
    }


@router.put("/config/model")
async def switch_model(update: ModelSwitch):
    """切换 DeepSeek 模型（热更新，立即生效）"""
    valid_ids = [m["id"] for m in _DEEPSEEK_MODELS]
    if update.model not in valid_ids:
        raise HTTPException(status_code=400, detail=f"无效的模型: {update.model}，可选: {valid_ids}")

    settings.deepseek_model = update.model

    from llm import reload_llm
    reload_llm()

    return {"success": True, "model": update.model, "message": f"已切换到 {update.model}，立即生效"}


@router.put("/config/params")
async def update_params(update: ParamsUpdate):
    """更新运行参数（热更新，立即生效）"""
    updated = []
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(settings, field, value)
        updated.append(field)

    if not updated:
        raise HTTPException(status_code=400, detail="没有修改")

    return {"success": True, "updated_fields": updated, "message": f"已更新 {len(updated)} 项参数"}


@router.post("/config/test")
async def test_current_model():
    """测试当前模型连接"""
    import time
    try:
        from llm import get_llm
        from langchain_core.messages import HumanMessage

        llm = get_llm()
        start = time.time()
        resp = llm.invoke([HumanMessage(content="回复 OK")])
        elapsed = time.time() - start

        return {
            "success": True,
            "model": settings.deepseek_model,
            "elapsed_s": round(elapsed, 2),
            "response": resp.content[:50] if hasattr(resp, "content") else str(resp)[:50],
        }
    except Exception as e:
        return {"success": False, "error": f"{type(e).__name__}: {str(e)}"}
