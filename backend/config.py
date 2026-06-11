"""Pydantic Settings 配置管理 - 环境变量 / 路径 / 模型参数"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings


# 项目根目录 = backend 的父目录
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """应用全局配置，自动从 .env 文件加载"""

    # ── LLM: DeepSeek ──
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    deepseek_temperature: float = 0.0
    deepseek_max_tokens: int = 4096

    # ── Embedding: 本地 Ollama bge-m3 (主方案) ──
    embedding_provider: str = "ollama"          # "ollama" | "openai" | "deepseek"
    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "bge-m3"

    # 备用云端 embedding 配置 (未来切换时使用)
    embedding_api_key: str = ""
    embedding_base_url: str = ""
    embedding_model_name: str = ""

    # ── 向量库 ──
    vectorstore_dir: str = str(BACKEND_DIR / "data" / "vectorstore")
    chunk_size: int = 1000
    chunk_overlap: int = 200

    # ── 研究员 ──
    max_rewrite_attempts: int = 2               # 最大改写重试次数
    top_k_retrieval: int = 5                    # 每次检索返回文档数
    max_search_queries: int = 3                 # 研究员最多生成几个并行查询

    # ── HITL ──
    # SQLite checkpointer 数据库路径
    checkpointer_db_path: str = str(BACKEND_DIR / "data" / "checkpoints.db")

    # ── Server ──
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {
        "env_file": str(BACKEND_DIR / ".env"),
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
        "extra": "ignore",
    }


# 全局单例
settings = Settings()

# 确保数据目录存在
os.makedirs(settings.vectorstore_dir, exist_ok=True)
os.makedirs(os.path.dirname(settings.checkpointer_db_path), exist_ok=True)