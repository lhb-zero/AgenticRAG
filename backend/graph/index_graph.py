"""索引图 - 文档解析 → 分块 → 向量化 → 写入 FAISS

启动时自动索引预设的 Mock 中文文档，方便开箱即用。
"""

import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_core.documents import Document

from config import settings
from tools.retriever import build_vectorstore, reset_vectorstore


# ═══════════════════════════════════════════════
# 预设 Mock 文档 (中文)
# ═══════════════════════════════════════════════

MOCK_DOCS = [
    {
        "title": "LangGraph 架构概述",
        "content": """
# LangGraph 架构概述

## 1. 什么是 LangGraph

LangGraph 是 LangChain 生态中的状态机图编排框架，用于构建复杂的多步骤 AI Agent 工作流。

### 1.1 核心概念

- **StateGraph**: 状态图是 LangGraph 的核心抽象，定义了节点和边的图结构
- **Node**: 图中的节点，每个节点是一个处理函数，接收状态并返回更新后的状态
- **Edge**: 连接节点的边，分为普通边(固定路由)和条件边(动态路由)
- **State**: 状态对象，在节点间流转，使用 TypedDict 定义

### 1.2 状态管理

LangGraph 使用 `Annotated[type, reducer]` 机制管理状态更新:
- `add_messages`: 消息列表的追加合并器
- 自定义 reducer: 可实现覆盖、追加、合并等逻辑

### 1.3 Checkpointer

Checkpointer 是 LangGraph 的检查点机制，用于:
- 持久化图执行状态
- 支持 Human-in-the-Loop (HITL) 中断恢复
- 支持时间旅行调试

支持的 Checkpointer 后端:
- MemorySaver: 内存存储，适合开发测试
- SqliteSaver: SQLite 持久化，适合单机部署
- PostgresSaver: PostgreSQL 持久化，适合生产环境
""",
    },
    {
        "title": "LangGraph 状态机 API 使用指南",
        "content": """
# LangGraph 状态机 API 使用指南

## 2. 构建图的基本步骤

### 2.1 定义状态

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class MyState(TypedDict):
    messages: Annotated[list, add_messages]
    query: str
    result: str
```

### 2.2 创建图

```python
from langgraph.graph import StateGraph

builder = StateGraph(MyState)
```

### 2.3 添加节点

```python
builder.add_node("process", process_node)
builder.add_node("generate", generate_node)
```

### 2.4 添加边

```python
# 固定边
builder.add_edge("process", "generate")

# 条件边
builder.add_conditional_edges(
    "grade",
    decide_next,
    {"relevant": "generate", "irrelevant": "rewrite"}
)
```

### 2.5 设置入口和出口

```python
builder.set_entry_point("process")
builder.set_finish_point("generate")
```

### 2.6 编译图

```python
graph = builder.compile(checkpointer=checkpointer)
```

## 3. Human-in-the-Loop

### 3.1 中断机制

使用 `interrupt_before` 在指定节点前挂起:
```python
graph = builder.compile(
    checkpointer=checkpointer,
    interrupt_before=["human_review"]
)
```

### 3.2 恢复执行

```python
from langgraph.types import Command

graph.invoke(
    Command(resume={"approved": True, "feedback": "修改建议"}),
    config
)
```
""",
    },
    {
        "title": "企业合规规范 - 数据安全",
        "content": """
# 企业合规规范 - 数据安全篇

## 1. 数据分类与保护

### 1.1 数据分类标准

企业数据分为以下四个等级:
- **公开数据 (L1)**: 可对外公开的信息，如产品介绍、新闻稿
- **内部数据 (L2)**: 仅限企业内部使用，如内部通知、培训材料
- **机密数据 (L3)**: 需要授权访问，如客户信息、财务报表
- **绝密数据 (L4)**: 最高安全级别，如核心知识产权、战略规划

### 1.2 数据保护措施

- 所有 L3 及以上数据必须加密存储
- 传输过程必须使用 TLS 1.2 及以上协议
- 访问日志保留不少于 180 天
- 定期进行数据安全审计，频率不低于每季度一次

## 2. 访问控制

### 2.1 最小权限原则

- 员工仅获得完成工作所需的最小权限
- 权限申请需要直属上级和部门负责人双重审批
- 权限每半年进行一次复核

### 2.2 多因素认证

- 所有生产系统必须启用 MFA
- 支持 TOTP 和硬件密钥两种方式
- 紧急情况下可使用一次性备用码
""",
    },
    {
        "title": "企业合规规范 - AI 使用政策",
        "content": """
# 企业合规规范 - AI 使用政策篇

## 1. AI 工具使用原则

### 1.1 数据安全

- 严禁将 L3 及以上级别的数据输入外部 AI 服务
- 使用内部部署的 AI 模型处理敏感数据
- AI 对话记录需保留审计日志

### 1.2 输出审核

- AI 生成的代码必须经过 Code Review 后方可合并
- AI 生成的文档必须标注"AI 辅助生成"
- 关键决策不能完全依赖 AI 输出，必须有人员复核

## 2. AI Agent 使用规范

### 2.1 权限控制

- AI Agent 的权限应遵循最小权限原则
- Agent 执行高风险操作(如数据库修改、配置变更)必须经过人工确认
- 必须为 Agent 设置操作频率限制和金额上限

### 2.2 审计与追溯

- 所有 Agent 操作必须记录完整的决策链路
- 审计日志包含: 时间、操作者、输入、输出、使用的工具
- 日志保留不少于 365 天

## 3. 模型管理

- 使用外部模型需经安全评估
- 禁止使用未经验证的开源模型处理业务数据
- 定期评估模型的安全性和准确性
""",
    },
    {
        "title": "LangGraph 多图编排与子图",
        "content": """
# LangGraph 多图编排与子图

## 1. 子图概念

LangGraph 支持将一个图作为另一个图的节点使用，实现多图编排。

### 1.1 子图定义

```python
# 定义子图
subgraph_builder = StateGraph(SubState)
subgraph_builder.add_node("step1", step1_func)
subgraph_builder.set_entry_point("step1")
subgraph = subgraph_builder.compile()

# 在主图中使用子图
main_builder = StateGraph(MainState)
main_builder.add_node("sub_task", subgraph)
```

### 1.2 状态映射

子图与主图之间的状态通过共享键名自动映射:
- 子图可以读取主图状态中同名的键
- 子图的输出会自动合并回主图状态

## 2. ReAct 循环实现

ReAct (Reasoning + Acting) 是 Agent 的核心模式:

```
Plan → Act → Observe → Decide → (重复或结束)
```

### 2.1 条件边控制循环

```python
def should_continue(state):
    if state["done"]:
        return "end"
    if state["retry_count"] >= MAX_RETRIES:
        return "end"
    return "continue"

builder.add_conditional_edges(
    "decide",
    should_continue,
    {"continue": "plan", "end": END}
)
```

### 2.2 防止死循环

必须设置最大重试次数和明确的退出条件，避免 Agent 进入无限循环。
""",
    },
    {
        "title": "企业内部知识库建设指南",
        "content": """
# 企业内部知识库建设指南

## 1. 知识库架构设计

### 1.1 文档分类体系

- 技术文档: 架构设计、API 文档、运维手册
- 业务文档: 需求文档、业务流程、操作手册
- 管理制度: 人事制度、财务制度、合规规范
- 培训材料: 入职培训、技能培训、安全培训

### 1.2 向量化策略

- 中文文档推荐使用 BGE-M3 或 text2vec 系列模型
- 文档分块大小建议 800-1200 tokens
- 重叠区域建议 100-200 tokens
- 对于技术文档，保留代码块的完整性

## 2. RAG 系统建设

### 2.1 检索策略

- 混合检索: 结合关键词检索(BM25)和向量检索(Dense Retrieval)
- 多轮检索: 对初次检索结果不佳的情况进行查询改写和重检索
- 重排序: 使用 Cross-Encoder 模型对候选文档进行精细排序

### 2.2 质量控制

- 文档相关性评分: 使用 LLM 对检索结果进行逐条打分
- 答案忠实度检查: 验证生成答案是否基于文档内容
- 人工审核: 关键场景引入人工确认环节
""",
    },
]


def _chunk_documents(raw_docs: list[dict]) -> list[Document]:
    """将原始文档分块"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
    )

    all_chunks = []
    for doc in raw_docs:
        chunks = splitter.create_documents(
            texts=[doc["content"]],
            metadatas=[{"title": doc["title"], "source": "mock"}],
        )
        all_chunks.extend(chunks)

    return all_chunks


def build_index_from_mock():
    """使用预设 Mock 文档构建索引"""
    chunks = _chunk_documents(MOCK_DOCS)
    build_vectorstore(chunks)
    return len(chunks)


def build_index_from_directory(directory: str) -> int:
    """从目录加载文档并构建索引"""
    from langchain_community.document_loaders import (
        PyPDFLoader,
        Docx2txtLoader,
        UnstructuredMarkdownLoader,
    )

    all_docs = []
    for filename in os.listdir(directory):
        filepath = os.path.join(directory, filename)
        if not os.path.isfile(filepath):
            continue

        ext = os.path.splitext(filename)[1].lower()

        try:
            if ext == ".txt":
                loader = TextLoader(filepath, encoding="utf-8")
            elif ext == ".pdf":
                loader = PyPDFLoader(filepath)
            elif ext in (".docx", ".doc"):
                loader = Docx2txtLoader(filepath)
            elif ext == ".md":
                loader = UnstructuredMarkdownLoader(filepath)
            else:
                continue

            all_docs.extend(loader.load())
        except Exception as e:
            print(f"加载文件 {filename} 失败: {e}")

    if not all_docs:
        return 0

    # 分块
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", "。", "！", "？", "；", "，", " ", ""],
    )
    chunks = splitter.split_documents(all_docs)

    # 构建向量库
    build_vectorstore(chunks)
    reset_vectorstore()

    return len(chunks)


def init_index_on_startup():
    """应用启动时初始化索引 (如果不存在则自动构建)"""
    index_path = os.path.join(settings.vectorstore_dir, "index.faiss")

    if not os.path.exists(index_path):
        print("[IndexGraph] 索引不存在，使用 Mock 数据构建...")
        chunk_count = build_index_from_mock()
        print(f"[IndexGraph] 索引构建完成，共 {chunk_count} 个分块")
    else:
        print("[IndexGraph] 索引已存在，跳过构建")