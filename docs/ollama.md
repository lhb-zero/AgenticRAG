# Ollama 专项

> 本地大模型运行时 — 无需 GPU，本地运行 LLM / Embedding

---

## 目录

- [1. 基本概念](#1-基本概念)
- [2. 安装与启动](#2-安装与启动)
- [3. 模型管理](#3-模型管理)
- [4. LangChain 集成](#4-langchain-集成)
- [5. 本项目的使用方式](#5-本项目的使用方式)
- [6. 云端 Embedding 切回方案](#6-云端-embedding-切回方案)
- [7. 常见问题](#7-常见问题)

---

## 1. 基本概念

Ollama 是一个**本地运行大模型**的工具，特点：

- **零配置**：下载即用，不需要 CUDA / Docker / 复杂环境
- **CPU 友好**：纯 CPU 也能运行（有 GPU 更快）
- **REST API**：提供 `http://localhost:11434` 的标准 API
- **模型丰富**：支持 Llama、Mistral、Gemma、BGE 等数百个模型

### 本项目的定位

| 模型类型 | 方案 | 说明 |
|----------|------|------|
| **LLM（对话/生成）** | DeepSeek v4-flash（云端 API） | 需要付费 |
| **Embedding（向量化）** | Ollama bge-m3（本地） | 免费、隐私数据不出本地 |

---

## 2. 安装与启动

### 2.1 安装

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# Windows
# 从 https://ollama.com/download 下载安装包

# 验证安装
ollama --version
```

### 2.2 启动服务

```bash
# 启动 Ollama 后台服务（通常安装后自动启动）
ollama serve

# 默认监听: http://localhost:11434
```

### 2.3 拉取模型

```bash
# 拉取 BGE-M3 embedding 模型（约 1.2 GB）
ollama pull bge-m3

# 查看已安装的模型
ollama list
# → NAME          ID              SIZE      MODIFIED
# → bge-m3:latest  790764642607    1.2 GB    2 days ago
```

### 2.4 测试 embedding

```bash
# 用 curl 测试 API
curl http://localhost:11434/api/embeddings -d '{
  "model": "bge-m3",
  "prompt": "你好世界"
}'
# → {"embedding": [0.023, -0.015, 0.891, ...]}
```

---

## 3. 模型管理

### 3.1 常用命令

```bash
ollama pull <model>     # 下载模型
ollama list             # 列出本地模型
ollama rm <model>       # 删除模型
ollama run <model>      # 交互式运行（聊天模式）
ollama show <model>     # 查看模型详情
```

### 3.2 BGE-M3 模型详情

```
模型名: bge-m3
开发者: BAAI（北京智源人工智能研究院）
特点:
  - 多语言：中英文混合训练
  - 多粒度：同时支持 dense + sparse 检索
  - 维度：1024 维
  - 最大输入：8192 tokens
  - 大小：约 1.2 GB
适用场景: 中文文档检索、语义匹配
```

### 3.3 其他适合 RAG 的 Embedding 模型

```bash
ollama pull nomic-embed-text    # 英文为主，768 维，约 274 MB
ollama pull mxbai-embed-large   # 英文，1024 维，约 670 MB
```

---

## 4. LangChain 集成

### 4.1 安装依赖

```bash
pip install langchain-ollama
```

### 4.2 基本用法

```python
from langchain_ollama import OllamaEmbeddings

embeddings = OllamaEmbeddings(
    model="bge-m3",
    base_url="http://localhost:11434",     # Ollama 服务地址
    # 可选参数:
    # num_ctx=4096,    # 上下文窗口大小
    # temperature=0,   # 温度
)

# 单条向量化
vector = embeddings.embed_query("什么是 LangGraph？")
print(len(vector))  # → 1024

# 批量向量化
texts = ["文本1", "文本2", "文本3"]
vectors = embeddings.embed_documents(texts)
print(len(vectors))  # → 3
print(len(vectors[0]))  # → 1024
```

### 4.3 配合 FAISS 使用

```python
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings

embeddings = OllamaEmbeddings(model="bge-m3", base_url="http://localhost:11434")

# 构建向量库
vectorstore = FAISS.from_texts(
    texts=["文档1", "文档2", "文档3"],
    embedding=embeddings,
)

# 检索
docs = vectorstore.similarity_search("查询文本", k=5)
```

### 4.4 错误排查

```python
# 测试连接
from ollama import Client

client = Client(host="http://localhost:11434")
try:
    models = client.list()
    print(f"已连接，模型列表: {[m['name'] for m in models['models']]}")
except Exception as e:
    print(f"连接失败: {e}")
    print("请确保 ollama serve 正在运行")
```

---

## 5. 本项目的使用方式

### 5.1 策略模式封装

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
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(
            model=settings.embedding_model_name,
            api_key=settings.embedding_api_key,
            base_url=settings.embedding_base_url,
        )
```

### 5.2 配置文件

```env
# .env
EMBEDDING_PROVIDER=ollama                     # 当前使用 Ollama
OLLAMA_BASE_URL=http://localhost:11434         # 本地地址
OLLAMA_EMBEDDING_MODEL=bge-m3                 # 模型名

# 将来切到云端时，只需改 4 行：
# EMBEDDING_PROVIDER=openai
# EMBEDDING_API_KEY=sk-xxx
# EMBEDDING_BASE_URL=https://api.openai.com/v1
# EMBEDDING_MODEL_NAME=text-embedding-3-small
```

---

## 6. 云端 Embedding 切回方案

### 6.1 切换步骤

1. **购买 API Key**（OpenAI / DeepSeek / 其他）
2. **修改 .env**：

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_API_KEY=sk-your-key-here
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL_NAME=text-embedding-3-small
```

3. **重建索引**（因为不同模型的向量空间不兼容）：

```bash
# 删除旧索引
rm -rf backend/data/vectorstore/

# 重启后端，自动重建
python backend/main.py
```

### 6.2 修改代码？

不需要。`llm.py` 中的 `get_embeddings()` 已经通过策略模式适配了两种 provider：

```python
if settings.embedding_provider == "ollama":
    return OllamaEmbeddings(...)
elif settings.embedding_provider in ("openai", "deepseek"):
    return OpenAIEmbeddings(...)
```

---

## 7. 常见问题

### Q1: 首次调用很慢？

Ollama 第一次加载模型需要将模型文件加载到内存（约 1.2 GB），后续调用会快很多。可以在启动时预热：

```python
# 在 lifespan 中预热
async def lifespan(app):
    embeddings = get_embeddings()
    embeddings.embed_query("warmup")  # 触发模型加载
    yield
```

### Q2: 向量维度对不上？

不同模型的输出维度不同：

| 模型 | 维度 |
|------|------|
| bge-m3 | 1024 |
| text-embedding-3-small | 1536 |
| text-embedding-3-large | 3072 |
| nomic-embed-text | 768 |

**切换模型后必须重建索引**，否则维度不匹配会导致检索失败。

### Q3: Ollama 占用内存太高？

默认 Ollama 会将模型加载到内存。如果内存不足：

```bash
# 使用完成后卸载模型
ollama stop bge-m3

# 或设置 OLLAMA_NUM_PARALLEL 限制并发
OLLAMA_NUM_PARALLEL=1 ollama serve
```

### Q4: Docker 中如何连接宿主机的 Ollama？

```yaml
# docker-compose.yml
backend:
  environment:
    - OLLAMA_BASE_URL=http://host.docker.internal:11434  # Mac/Windows
    # 或 Linux:
    - OLLAMA_BASE_URL=http://172.17.0.1:11434
```

---

## 项目文件索引

| 文件 | 内容 |
|------|------|
| [llm.py](../backend/llm.py) | get_embeddings() — Ollama/云端 Embedding 封装 |
| [config.py](../backend/config.py) | embedding_provider / ollama_base_url 等配置 |
| [.env.example](../backend/.env.example) | Ollama 相关环境变量模板 |
| [docker-compose.yml](../docker-compose.yml) | Docker 中 Ollama 的连接配置 |

## 延伸资源

- [Ollama 官网](https://ollama.com/)
- [Ollama GitHub](https://github.com/ollama/ollama)
- [BGE-M3 模型页](https://ollama.com/library/bge-m3)
- [Ollama API 文档](https://github.com/ollama/ollama/blob/main/docs/api.md)