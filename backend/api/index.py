"""文档上传 / 触发索引构建端点

POST /api/index/build - 触发索引构建 (从 Mock 数据或上传目录)
POST /api/index/upload - 上传文档文件
"""

import os
import shutil
from fastapi import APIRouter, UploadFile, File, HTTPException

from config import settings, BACKEND_DIR
from graph.index_graph import build_index_from_mock, build_index_from_directory

router = APIRouter(prefix="/api/index", tags=["index"])


@router.post("/build")
async def trigger_index_build(source: str = "mock"):
    """触发索引构建

    Args:
        source: "mock" - 使用预设 Mock 数据; "uploaded" - 使用已上传到 data/raw 的文档
    """
    try:
        if source == "mock":
            chunk_count = build_index_from_mock()
            return {
                "success": True,
                "source": "mock",
                "chunk_count": chunk_count,
                "message": f"Mock 索引构建成功，共 {chunk_count} 个分块",
            }
        elif source == "uploaded":
            raw_dir = os.path.join(str(BACKEND_DIR), "data", "raw")
            chunk_count = build_index_from_directory(raw_dir)
            return {
                "success": True,
                "source": "uploaded",
                "chunk_count": chunk_count,
                "message": f"文档索引构建成功，共 {chunk_count} 个分块",
            }
        else:
            raise HTTPException(status_code=400, detail=f"不支持的 source: {source}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"索引构建失败: {str(e)}")


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """上传文档到 data/raw 目录并自动重建索引"""
    allowed_extensions = {".txt", ".pdf", ".docx", ".doc", ".md"}

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}。支持: {', '.join(allowed_extensions)}",
        )

    raw_dir = os.path.join(str(BACKEND_DIR), "data", "raw")
    os.makedirs(raw_dir, exist_ok=True)

    file_path = os.path.join(raw_dir, file.filename)

    try:
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")

    # 上传成功后自动重建索引
    try:
        chunk_count = build_index_from_directory(raw_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件上传成功但索引构建失败: {str(e)}")

    return {
        "success": True,
        "filename": file.filename,
        "path": file_path,
        "chunk_count": chunk_count,
        "message": f"文件上传成功，索引已更新（共 {chunk_count} 个分块）",
    }