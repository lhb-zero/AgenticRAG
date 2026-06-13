# FAISS 专项

> Facebook AI Similarity Search — 高效向量相似度检索

---

## 目录

- [1. 基本概念](#1-基本概念)
- [2. 从零构建向量库](#2-从零构建向量库)
- [3. 检索方法](#3-检索方法)
- [4. 持久化与加载](#4-持久化与加载)
- [5. 性能与参数调优](#5-性能与参数调优)
- [6. 本项目封装](#6-本项目封装)
- [7. 常见问题](#7-常见问题)

---

## 1. 基本概念

### 1.1 是什么

FAISS（Facebook AI Similarity Search）是 Meta 开源的向量相似度搜索库，专门用于高效检索亿级高维向量。

### 1.2 核心概念

```
文档 → Embedding 模型 → 向量 [0.12, 0.89, -0.34, ...]
                              ↓
                        存入 FAISS 索引
                              ↓
用户查询 → Embedding 模型 → 查询向量
                              ↓
                    FAISS 计算余弦/L2 距离
                              ↓
                    返回最相似的前 K 个文档
```

### 1.3 CPU vs GPU

| 版本 | 包名 | 适用 |
|------|------|------|
| CPU | `faiss-cpu` | 开发环境 / 小规模数据（本项目使用） |
| GPU | `faiss-gpu` | 生产环境 / 大规模数据 |

### 1.4 索引类型

FAISS 提供多种索引类型，LangChain 的 `FAISS` 封装默认使用 `IndexFlatL2`（暴力搜索 + L2 距离），准确性最高，适合开发阶段。

---

## 2. 从零构建向量库

### 2.1 从文本构建

```python
from langchain_community.vectorstores import FAISS

texts = [
    "LangGraph 是 LangChain 的状态机图编排框架",
    "FAISS 是 Meta 开源的高效向量检索库",
    "BGE-M3 是中英文多粒度 Embedding 模型",
]

# 构建索引
vectorstore = FAISS.from_texts(
    texts=texts,
    embedding=embeddings,      # Embedding 模型实例
)
```

### 2.2 从 Document 列表构建

```python
from langchain_core.documents import Document

docs = [
    Document(page_content="文本1", metadata={"title": "文档A"}),
    Document(page_content="文本2", metadata={"title": "文档B"}),
]

vectorstore = FAISS.from_documents(
    documents=docs,
    embedding=embeddings,
)
```

**注意**：`metadata` 会随文档一起保存，检索时可以读取。

### 2.3 增量添加文档

```python
# 已有索引，追加新文档
new_docs = [Document(page_content="新文档内容...")]
vectorstore.add_documents(new_docs)
```

---

## 3. 检索方法

### 3.1 相似度搜索（基础）

```python
docs = vectorstore.similarity_search(
    "什么是 LangGraph？",
    k=5,  # 返回前 5 个
)
# 返回 List[Document]，不包含分数
```

### 3.2 带分数的相似度搜索

```python
docs_with_scores = vectorstore.similarity_search_with_score(
    "什么是 LangGraph？",
    k=5,
)
# 返回 List[Tuple[Document, float]]
# 分数是 L2 距离，越小越相似
```

#### L2 距离 → 相似度的转换

```python
# L2 距离范围: [0, +∞)，越小越相似
# 本项目的转换公式:
similarity = 1.0 / (1.0 + l2_score)

# 示例:
# l2_score = 0.0  → similarity = 1.0 (完全相同)
# l2_score = 1.0  → similarity = 0.5
# l2_score = 9.0  → similarity = 0.1
```

### 3.3 MMR 搜索（最大边际相关性）

```python
docs = vectorstore.max_marginal_relevance_search(
    "查询文本",
    k=5,               # 最终返回 5 个文档
    fetch_k=20,        # 先从候选池 fetch 20 个
    lambda_mult=0.7,   # 相关性权重 (0~1)
)
```

#### MMR 原理

```
MMR = λ × relevance(q, doc) - (1-λ) × max_similarity(doc, already_selected)

λ = 1.0  → 纯相关性排序（等价于 similarity_search）
λ = 0.7  → 偏相关性，保留一定多样性（本项目默认）
λ = 0.0  → 纯多样性（结果彼此差异最大）
```

**为什么用 MMR？** 防止返回 5 条几乎相同的文档。比如知识库中有 3 篇高度重复的合规文档，MMR 会优先选择内容差异大的。

### 3.4 带过滤的检索

```python
# 只检索特定来源的文档
docs = vectorstore.similarity_search(
    "查询",
    k=5,
    filter={"source": "compliance"},  # 仅 metadata.source == "compliance"
)
```

---

## 4. 持久化与加载

### 4.1 保存

```python
vectorstore.save_local(
    folder_path="./data/vectorstore",
    index_name="index",
)
# 生成文件:
#   ./data/vectorstore/index.faiss  — 向量索引（二进制）
#   ./data/vectorstore/index.pkl    — 文档元数据（Python pickle）
```

### 4.2 加载

```python
vectorstore = FAISS.load_local(
    folder_path="./data/vectorstore",
    embeddings=embeddings,
    index_name="index",
    allow_dangerous_deserialization=True,  # 允许加载 pickle
)
```

**安全提示**：`allow_dangerous_deserialization=True` 允许 pickle 反序列化，仅当加载可信文件时启用。

### 4.3 合并索引

```python
# 合并两个 FAISS 索引
db1 = FAISS.from_texts(["文本A"], embeddings)
db2 = FAISS.from_texts(["文本B"], embeddings)

db1.merge_from(db2)  # db1 现在包含 "文本A" + "文本B"
```

---

## 5. 性能与参数调优

### 5.1 chunk_size 对检索的影响

| chunk_size | 优点 | 缺点 |
|------------|------|------|
| 小 (200-500) | 检索精确、匹配粒度细 | 可能丢失上下文、块数多影响性能 |
| 中 (800-1200) | 平衡精度和上下文（本项目 1000） | — |
| 大 (2000+) | 保留完整上下文 | 检索不精确、噪声多 |

### 5.2 top_k_retrieval 的选择

```
top_k = 3  → 适合简单事实型查询
top_k = 5  → 通用场景（本项目默认）
top_k = 10 → 需要综合多文档的复杂查询
```

值越大，给后续 LLM 的上下文越多，但也会引入噪声。

### 5.3 MMR 的 fetch_k 与 lambda_mult

```
fetch_k = k × 4  → 候选池是最终结果的 4 倍（本项目默认）
lambda_mult = 0.7 → 偏向相关性的同时保留一定多样性
```

- 如果检索结果总是重复，降低 `lambda_mult`
- 如果检索结果太发散，提高 `lambda_mult`

---

## 6. 本项目封装

### 6.1 单例模式

```python
# tools/retriever.py

_vectorstore = None

def get_vectorstore():
    global _vectorstore
    if _vectorstore is not None:
        return _vectorstore
    # 尝试加载已有索引
    if os.path.exists(index_path):
        _vectorstore = FAISS.load_local(...)
        return _vectorstore
    # 否则返回空实例
    _vectorstore = FAISS.from_texts(["__placeholder__"], ...)
    return _vectorstore

def reset_vectorstore():
    """索引更新后调用，清除缓存"""
    global _vectorstore
    _vectorstore = None
```

### 6.2 封装后的对外接口

```python
# 相似度检索
docs = similarity_search(query, k=5)
# 返回: [{"content": str, "metadata": dict, "score": float}, ...]

# MMR 检索
docs = mmr_search(query, k=5, fetch_k=20, lambda_mult=0.7)
# 返回: [{"content": str, "metadata": dict, "score": None}, ...]
```

**为什么封装一层？** 统一返回 dict 格式（而非 LangChain Document 对象），方便前后端序列化。

### 6.3 启动时自动索引

```python
# main.py — 应用启动生命周期
@asynccontextmanager
async def lifespan(app):
    from graph.index_graph import init_index_on_startup
    init_index_on_startup()
    # → 检查向量库是否存在
    # → 不存在则用 Mock 数据自动构建
    yield
```

---

## 7. 常见问题

### Q1: 为什么不用 Milvus / Pinecone？

FAISS 适合本地开发和单机部署，零配置、零外部依赖。生产环境大规模数据可考虑 Milvus（分布式）或 Pinecone（云托管）。

### Q2: `allow_dangerous_deserialization=True` 安全吗？

仅在加载**自己生成的可信 pickle 文件**时安全。不要加载来源不明的 .pkl 文件。

### Q3: 向量库损坏怎么办？

删除 `data/vectorstore/` 目录，重启后端会自动使用 Mock 数据重建。

### Q4: 如何评估检索质量？

评估维度：
- **Recall@K**：前 K 个结果中包含正确答案的比例
- **MRR**：第一个正确答案的平均排名倒数
- 本项目中的 `doc_grades`（relevant/irrelevant/partial）可作为粗略的质量反馈信号

### Q5: 语义相近但用词不同的查询能找到吗？

能。向量的核心优势就是语义匹配：

```
"怎么管理公司数据安全"  ←→  "企业合规规范 - 数据安全篇"
（用词不同，但向量空间距离近）
```

搭配 MMR 可进一步提高召回率。

---

## 8. 生产环境考量

### 8.1 FAISS 的本质

FAISS 核心是 **C++ 实现**，Python 只是包装层。`pip install faiss-cpu` 装的是编译好的 C++ 动态库，检索速度和 C++ 直接调几乎一样，毫秒级返回。

### 8.2 数据安全：本地文件的风险

FAISS 数据保存为两个本地文件：

```
index.faiss  — 向量索引（二进制）
index.pkl    — 文档元数据（Python pickle）
```

**丢失 = 全部丢失**，没有内置的备份、副本、WAL 日志。生产中需要自行保障：
- 定期备份这两个文件到对象存储（S3/OSS）
- 源文档也要保留（索引丢了可以重建）
- 用 Docker volume 持久化，不要放在容器内部

### 8.3 大规模索引的加载性能

| 文档量 | 分块数 | 索引文件大小 | 冷启动加载时间 |
|--------|--------|-------------|--------------|
| 100 篇 | ~5000 | ~20 MB | 1-2 秒 |
| 1000 篇 | ~50000 | ~200 MB | 10-15 秒 |
| 10000 篇 | ~500000 | ~2 GB | 1-2 分钟 |

FAISS 加载索引 = 把整个文件读进内存 + 构建索引结构。万级以上文档量，每次重启都要等较长时间。

### 8.4 真实企业使用情况

**有企业用 FAISS，但场景明确：**

- **Meta 内部**（Instagram、Facebook 搜索）用 FAISS 处理十亿级向量
- **LangChain / LlamaIndex** 默认的向量库就是 FAISS
- 国内很多大模型应用的 demo / POC / 内部工具阶段都用 FAISS
- 一般作为**过渡方案**：先用 FAISS 跑通业务逻辑，验证 RAG 效果，再迁移到生产级方案

### 8.5 生产级迁移方案

当项目需要：多用户并发写入、文档量过万、索引高可用 —— 考虑以下方案：

| 方案 | 特点 | 适合场景 |
|------|------|---------|
| **Qdrant** | Rust 实现，轻量但功能全，原生支持 CRUD | 十万~百万级，兼顾性能和功能 |
| **Milvus** | 分布式架构，支持 CRUD，有云服务（Zilliz） | 百万级+，多租户，高可用 |
| **ChromaDB** | 嵌入式，像 SQLite 一样简单，支持 CRUD | 和 FAISS 定位类似但更好用 |
| **Pinecone** | 全托管 SaaS，不用自己部署 | 不想运维，直接用 |
| **Weaviate** | 支持混合检索（向量 + 关键词） | 需要语义 + 关键词双路检索 |

**迁移成本低**：LangChain 的 `VectorStore` 接口统一，切换方案主要改 import 和初始化代码，业务逻辑（检索、打分、RAG 流程）基本不变。

### 8.6 FAISS vs Milvus 详细对比

| | FAISS | Milvus |
|---|---|---|
| **本质** | 一个库（library） | 一个数据库服务（database） |
| **部署** | `pip install faiss-cpu`，嵌入 Python 进程 | 单独部署服务（Docker/K8s） |
| **数据持久化** | 本地文件（`.faiss` + `.pkl`） | 内置存储引擎 |
| **适用规模** | 十万到百万级，单机 | 千万到亿级，分布式 |
| **多租户** | 不支持 | 支持 collection/partition/权限 |
| **增删改** | 很弱，删文档需重建索引 | 原生 CRUD |
| **运维成本** | 零 | 需部署 etcd/MinIO/Pulsar 等 |
| **适合场景** | 原型/小项目/单机 RAG | 生产级大规模知识库 |

**类比**：
- FAISS = 电脑上的 Excel 文件，自己读写，轻量但功能有限
- Milvus = MySQL 数据库服务，多人用，功能全但要单独部署

---

## 项目文件索引

| 文件 | 内容 |
|------|------|
| [tools/retriever.py](../backend/tools/retriever.py) | FAISS 初始化 / 检索 / 持久化 |
| [graph/index_graph.py](../backend/graph/index_graph.py) | 文档分块 → 向量化 → 写入 FAISS |
| [config.py](../backend/config.py) | chunk_size / overlap / top_k 等配置 |

## 延伸资源

- [FAISS 官方文档](https://github.com/facebookresearch/faiss/wiki)
- [LangChain FAISS 集成](https://python.langchain.com/docs/integrations/vectorstores/faiss)
- [MMR 论文](https://www.cs.cmu.edu/~jgc/publication/The_Use_MMR_Diversity_Based_LTMIR_1998.pdf)