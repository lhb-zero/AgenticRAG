# LangChain 专项

> LLM 应用开发框架 — LLM 调用 / Embedding / 文档处理 / 工具链

---

## 目录

- [1. ChatOpenAI — LLM 调用](#1-chatopenai--llm-调用)
- [2. Embeddings — 文本向量化](#2-embeddings--文本向量化)
- [3. Document — 文档对象](#3-document--文档对象)
- [4. Text Splitter — 文档分块](#4-text-splitter--文档分块)
- [5. Document Loader — 文档加载](#5-document-loader--文档加载)
- [6. 消息类型](#6-消息类型)
- [7. 单例模式封装](#7-单例模式封装)
- [8. 项目文件索引](#8-项目文件索引)

---

## 1. ChatOpenAI — LLM 调用

### 1.1 基本用法

```python
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

llm = ChatOpenAI(
    model="deepseek-v4-flash",         # 模型名
    api_key="sk-xxx",                  # API Key
    base_url="https://api.deepseek.com",  # 兼容 OpenAI 协议的端点
    temperature=0.0,                   # 0 = 确定性输出，适合知识库
    max_tokens=4096,                   # 最大输出 token 数
)

# 简单调用
response = llm.invoke([HumanMessage(content="请用中文解释什么是 RAG")])
print(response.content)
```

### 1.2 多轮对话

```python
messages = [
    SystemMessage(content="你是一个企业知识库助手"),
    HumanMessage(content="什么是 StateGraph？"),
    AIMessage(content="StateGraph 是 LangGraph 的核心..."),
    HumanMessage(content="请详细解释它的状态管理机制"),
]
response = llm.invoke(messages)
```

### 1.3 关键参数说明

| 参数 | 作用 | 本项目取值 |
|------|------|-----------|
| `model` | 模型标识符 | `deepseek-v4-flash` |
| `api_key` | API 密钥 | 从 `.env` 读取 |
| `base_url` | API 端点地址 | `https://api.deepseek.com` |
| `temperature` | 随机性 (0~2) | `0.0`（知识库需要确定性） |
| `max_tokens` | 最大输出长度 | `4096` |

### 1.4 本项目封装方式

```python
# llm.py — 全局单例，避免每次请求重复初始化
from functools import lru_cache
from config import settings

@lru_cache(maxsize=1)
def get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.deepseek_model,
        api_key=settings.deepseek_api_key,
        base_url=settings.deepseek_base_url,
        temperature=settings.deepseek_temperature,
        max_tokens=settings.deepseek_max_tokens,
    )
```

**为什么用 `lru_cache`？** 确保整个应用生命周期中只创建一个 LLM 实例，避免连接泄漏和重复初始化开销。

---

## 2. Embeddings — 文本向量化

### 2.1 什么是 Embedding

将文本转换为高维向量（一组浮点数），语义相近的文本在向量空间中距离更近。

```
"猫" → [0.12, 0.89, -0.34, 0.56, ...]  (1024 维)
"小猫" → [0.15, 0.87, -0.31, 0.58, ...]  (相近)
"汽车" → [-0.67, 0.12, 0.78, -0.23, ...] (远离)
```

### 2.2 本项目使用的模型

**主方案：Ollama bge-m3（本地）**

```python
from langchain_ollama import OllamaEmbeddings

embeddings = OllamaEmbeddings(
    model="bge-m3",
    base_url="http://localhost:11434",
)

# 单条向量化
vector = embeddings.embed_query("Hello world")  # → [0.023, -0.015, ...]

# 批量向量化
vectors = embeddings.embed_documents(["文本1", "文本2", "文本3"])
```

**备用方案：云端 API（OpenAI / DeepSeek 兼容）**

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small",
    api_key="sk-xxx",
)
```

### 2.3 策略模式封装

```python
# llm.py
@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    if settings.embedding_provider == "ollama":
        return OllamaEmbeddings(
            model=settings.ollama_embedding_model,
            base_url=settings.ollama_base_url,
        )
    elif settings.embedding_provider in ("openai", "deepseek"):
        return OpenAIEmbeddings(
            model=settings.embedding_model_name,
            api_key=settings.embedding_api_key,
        )
    else:
        raise ValueError(f"不支持的 embedding_provider")
```

切换方式：只需改 `.env` 中的 `EMBEDDING_PROVIDER` 一行，无需改代码。

---

## 3. Document — 文档对象

### 3.1 数据结构

```python
from langchain_core.documents import Document

doc = Document(
    page_content="这是文档的正文内容，会被向量化用于检索...",
    metadata={
        "title": "LangGraph 架构概述",
        "source": "mock",
        "page": 1,
        # 可以添加任意自定义元数据
    },
)
```

### 3.2 字段说明

| 字段 | 用途 | 是否参与检索 |
|------|------|-------------|
| `page_content` | 文档正文（会被 embedding） | 是 |
| `metadata` | 附加信息（标题、来源、页码等） | 否（仅用于过滤和展示） |

### 3.3 本项目中的用法

```python
# index_graph.py — 从 Mock 数据创建 Document
for doc in MOCK_DOCS:
    chunks = splitter.create_documents(
        texts=[doc["content"]],
        metadatas=[{"title": doc["title"], "source": "mock"}],
    )

# retriever.py — 检索结果中读取
for doc in retriever_results:
    content = doc["content"]        # page_content
    title = doc["metadata"]["title"]  # 元数据
```

---

## 4. Text Splitter — 文档分块

### 4.1 为什么需要分块

- LLM 的上下文窗口有限（本项目 max_tokens=4096）
- 向量检索需要较短的文本块才能精确匹配
- 长文档一次塞入会超出 token 限制

### 4.2 RecursiveCharacterTextSplitter

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,      # 每块最大字符数
    chunk_overlap=200,    # 相邻块重叠字符数
    separators=[
        "\n\n",   # 优先级 1：段落分隔
        "\n",     # 优先级 2：换行
        "。",     # 优先级 3：中文句号
        "！",     # 优先级 4：中文感叹号
        "？",     # 优先级 5：中文问号
        "；",     # 优先级 6：分号
        "，",     # 优先级 7：逗号
        " ",      # 优先级 8：空格
        "",       # 优先级 9：逐个字符切分
    ],
)

chunks = splitter.split_documents(documents)
```

### 4.3 递归切分原理

```
第一轮：用 "\n\n" 切分
  → 如果某段 > chunk_size，进入下一轮
第二轮：用 "\n" 切分
  → 如果某段 > chunk_size，进入下一轮
...
最后一轮：逐字符切分（兜底）
```

### 4.4 chunk_overlap 的作用

```
原始文本: [句子A][句子B][句子C][句子D][句子E]

chunk_overlap = 0:
  块1: [A][B][C]       ← B 和 C 之间可能被切断
  块2: [D][E]

chunk_overlap = 200:
  块1: [A][B][C][D]
  块2: [C][D][E]       ← C、D 在两块中都出现
```

重叠确保被切在边界的句子不会丢失。

---

## 5. Document Loader — 文档加载

### 5.1 支持的格式

| Loader | 格式 | 依赖 |
|--------|------|------|
| `TextLoader` | .txt | 内置 |
| `PyPDFLoader` | .pdf | `pypdf` |
| `Docx2txtLoader` | .docx | `docx2txt` |
| `UnstructuredMarkdownLoader` | .md | `unstructured` |

### 5.2 本项目用法

```python
# index_graph.py — 根据扩展名选择 Loader
ext = os.path.splitext(filename)[1].lower()

if ext == ".txt":
    loader = TextLoader(filepath, encoding="utf-8")
elif ext == ".pdf":
    loader = PyPDFLoader(filepath)
elif ext in (".docx", ".doc"):
    loader = Docx2txtLoader(filepath)
elif ext == ".md":
    loader = UnstructuredMarkdownLoader(filepath)
```

---

## 6. 消息类型

LangChain 定义了四种消息类型：

```python
from langchain_core.messages import (
    HumanMessage,    # 用户消息
    AIMessage,       # AI 回复
    SystemMessage,   # 系统提示（角色设定）
    ToolMessage,     # 工具调用结果
)
```

### 本项目中的使用

```python
# Prompt 填到 HumanMessage 中（最通用）
response = llm.invoke([HumanMessage(content=prompt)])

# 在状态中记录节点输出（用 add_messages 追加）
return {
    "messages": [
        AIMessage(content=f"检索到 {len(docs)} 个相关文档"),
    ],
}
```

---

## 7. 单例模式封装

### 7.1 问题

如果每次请求都 `new ChatOpenAI()`，会导致：
- 重复创建 HTTP 连接池
- 内存浪费
- 潜在的连接泄漏

### 7.2 解决方案

```python
from functools import lru_cache

@lru_cache(maxsize=1)
def get_llm():
    return ChatOpenAI(...)

@lru_cache(maxsize=1)
def get_embeddings():
    return OllamaEmbeddings(...)

# 使用
llm = get_llm()    # 第一次调用创建实例
llm = get_llm()    # 后续调用返回同一个实例（缓存命中）
```

### 7.3 何时需要清除缓存

- 运行时修改了配置 → 需要重启应用
- 测试中切换模型 → 调用 `get_llm.cache_clear()`

---

## 8. 项目文件索引

| 文件 | 涉及内容 |
|------|----------|
| [config.py](../backend/config.py) | LLM/Embedding 配置（base_url, model, temperature 等） |
| [llm.py](../backend/llm.py) | ChatOpenAI + Embedding 单例封装 |
| [prompts/researcher.py](../backend/prompts/researcher.py) | 查询规划 + 查询改写 Prompt |
| [prompts/grader.py](../backend/prompts/grader.py) | 文档打分 + 幻觉检测 Prompt |
| [prompts/generator.py](../backend/prompts/generator.py) | 大纲生成 + 答案生成 + 大纲修订 Prompt |
| [graph/index_graph.py](../backend/graph/index_graph.py) | Document / TextSplitter / Loader 使用 |
| [graph/researcher_graph.py](../backend/graph/researcher_graph.py) | ChatOpenAI.invoke() 调用示例 |
| [graph/retrieval_graph.py](../backend/graph/retrieval_graph.py) | ChatOpenAI.invoke() + 消息管理 |