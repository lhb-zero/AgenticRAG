"""FAISS 向量库工具 - 初始化 / 相似度检索 / MMR 重排

注意: FAISS 的 C++ 底层 (FileIOWriter) 在 Windows 上无法处理含中文/非 ASCII 的路径。
因此所有 save/load 操作均使用临时 ASCII 目录中转。
"""

import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

from langchain_community.vectorstores import FAISS
from langchain_community.docstore.document import Document
from langchain_core.embeddings import Embeddings

from config import settings
from llm import get_embeddings


# ── 全局单例：FAISS 向量库实例 ──
_vectorstore: Optional[FAISS] = None


def _is_ascii_safe(path: str) -> bool:
    """检查路径是否纯 ASCII（FAISS C++ 底层要求）"""
    try:
        path.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def _faiss_save_local(vs: FAISS, folder_path: str, index_name: str = "index"):
    """安全保存 FAISS 索引，兼容含中文的 Windows 路径"""
    target = Path(folder_path)
    target.mkdir(parents=True, exist_ok=True)

    if _is_ascii_safe(str(target)):
        vs.save_local(folder_path=str(target), index_name=index_name)
        return

    # 路径含中文：先存到 ASCII 临时目录，再复制到目标
    with tempfile.TemporaryDirectory() as tmp_dir:
        vs.save_local(folder_path=tmp_dir, index_name=index_name)

        faiss_src = Path(tmp_dir) / f"{index_name}.faiss"
        pkl_src = Path(tmp_dir) / f"{index_name}.pkl"
        faiss_dst = target / f"{index_name}.faiss"
        pkl_dst = target / f"{index_name}.pkl"

        shutil.copy2(str(faiss_src), str(faiss_dst))
        shutil.copy2(str(pkl_src), str(pkl_dst))


def _faiss_load_local(folder_path: str, embeddings, index_name: str = "index") -> FAISS:
    """安全加载 FAISS 索引，兼容含中文的 Windows 路径"""
    target = Path(folder_path)

    if _is_ascii_safe(str(target)):
        return FAISS.load_local(
            folder_path=str(target),
            embeddings=embeddings,
            index_name=index_name,
            allow_dangerous_deserialization=True,
        )

    # 路径含中文：先复制到 ASCII 临时目录，再加载
    with tempfile.TemporaryDirectory() as tmp_dir:
        faiss_src = target / f"{index_name}.faiss"
        pkl_src = target / f"{index_name}.pkl"
        faiss_dst = Path(tmp_dir) / f"{index_name}.faiss"
        pkl_dst = Path(tmp_dir) / f"{index_name}.pkl"

        if not faiss_src.exists() or not pkl_src.exists():
            raise FileNotFoundError(f"索引文件不存在: {folder_path}")

        shutil.copy2(str(faiss_src), str(faiss_dst))
        shutil.copy2(str(pkl_src), str(pkl_dst))

        return FAISS.load_local(
            folder_path=tmp_dir,
            embeddings=embeddings,
            index_name=index_name,
            allow_dangerous_deserialization=True,
        )


def get_vectorstore() -> FAISS:
    """获取或加载 FAISS 向量库单例"""
    global _vectorstore

    if _vectorstore is not None:
        return _vectorstore

    index_path = os.path.join(settings.vectorstore_dir, "index.faiss")
    pkl_path = os.path.join(settings.vectorstore_dir, "index.pkl")

    if os.path.exists(index_path) and os.path.exists(pkl_path):
        embeddings = get_embeddings()
        _vectorstore = _faiss_load_local(
            folder_path=settings.vectorstore_dir,
            embeddings=embeddings,
            index_name="index",
        )
        return _vectorstore

    # 如果索引不存在，返回空实例 (后续由 index_graph 构建)
    embeddings = get_embeddings()
    _vectorstore = FAISS.from_texts(
        texts=["__placeholder__"],
        embedding=embeddings,
    )
    return _vectorstore


def reset_vectorstore():
    """重置向量库实例 (索引更新后调用)"""
    global _vectorstore
    _vectorstore = None


def build_vectorstore(documents: list[Document]) -> FAISS:
    """从文档列表构建 FAISS 向量库并持久化"""
    global _vectorstore

    embeddings = get_embeddings()
    _vectorstore = FAISS.from_documents(
        documents=documents,
        embedding=embeddings,
    )

    # 持久化到磁盘（兼容含中文路径）
    _faiss_save_local(
        vs=_vectorstore,
        folder_path=settings.vectorstore_dir,
        index_name="index",
    )
    return _vectorstore


def similarity_search(query: str, k: int = None) -> list[dict]:
    """相似度检索

    Returns:
        list[dict]: [{"content": str, "metadata": dict, "score": float}, ...]
    """
    if k is None:
        k = settings.top_k_retrieval

    vs = get_vectorstore()
    docs_with_scores = vs.similarity_search_with_score(query, k=k)

    results = []
    for doc, score in docs_with_scores:
        # FAISS score 是 L2 距离，越小越相似，转换为 0-1 相似度
        similarity = 1.0 / (1.0 + score)
        results.append({
            "content": doc.page_content,
            "metadata": doc.metadata,
            "score": round(similarity, 4),
        })

    return results


def mmr_search(query: str, k: int = None, fetch_k: int = None, lambda_mult: float = 0.7) -> list[dict]:
    """MMR (最大边际相关性) 检索 - 兼顾相关性和多样性

    Args:
        lambda_mult: 0=最大多样性, 1=最大相关性
    """
    if k is None:
        k = settings.top_k_retrieval
    if fetch_k is None:
        fetch_k = k * 4

    vs = get_vectorstore()
    docs = vs.max_marginal_relevance_search(
        query, k=k, fetch_k=fetch_k, lambda_mult=lambda_mult
    )

    results = []
    for doc in docs:
        results.append({
            "content": doc.page_content,
            "metadata": doc.metadata,
            "score": None,  # MMR 不返回 score
        })

    return results