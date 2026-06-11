"""LLM / Embedding 单例封装 - 避免重复初始化与连接泄漏

支持热更新：调用 reload_llm() / reload_embeddings() 清除缓存，下次获取时重新创建。
"""

from functools import lru_cache
from langchain_openai import ChatOpenAI
from langchain_ollama import OllamaEmbeddings
from langchain_core.embeddings import Embeddings

from config import settings


@lru_cache(maxsize=1)
def get_llm() -> ChatOpenAI:
    """获取 DeepSeek LLM 单例 (OpenAI 兼容接口)"""
    return ChatOpenAI(
        model=settings.deepseek_model,
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        temperature=settings.deepseek_temperature,
        max_tokens=settings.deepseek_max_tokens,
    )


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    """获取 Embedding 模型单例"""
    if settings.embedding_provider == "ollama":
        return OllamaEmbeddings(
            model=settings.ollama_embedding_model,
            base_url=settings.ollama_base_url,
        )
    elif settings.embedding_provider in ("openai", "deepseek"):
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(
            model=settings.embedding_model_name,
            api_key=settings.embedding_api_key,
            base_url=settings.embedding_base_url or None,
        )
    else:
        raise ValueError(f"不支持的 embedding_provider: {settings.embedding_provider}")


def reload_llm():
    """清除 LLM 缓存，下次调用 get_llm() 时使用最新配置重新创建"""
    get_llm.cache_clear()


def reload_embeddings():
    """清除 Embedding 缓存，下次调用 get_embeddings() 时使用最新配置重新创建"""
    get_embeddings.cache_clear()


def reload_all():
    """清除所有 LLM/Embedding 缓存"""
    reload_llm()
    reload_embeddings()
