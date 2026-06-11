# LangGraph 专项

> 状态机图编排框架 — 本项目 Agentic RAG 的核心引擎

---

## 目录

- [1. 基本概念](#1-基本概念)
- [2. 构建一个图](#2-构建一个图)
- [3. 状态管理](#3-状态管理)
- [4. 节点](#4-节点)
- [5. 边](#5-边)
- [6. 子图](#6-子图)
- [7. Human-in-the-Loop (HITL)](#7-human-in-the-loop-hitl)
- [8. Checkpointer](#8-checkpointer)
- [9. 常见问题](#9-常见问题)
- [10. 项目实际结构](#10-项目实际结构)

---

## 1. 基本概念

LangGraph 是 LangChain 团队开发的**有状态、可循环、可中断**的 Agent 图编排框架。与传统的单向 Chain 不同，LangGraph 支持：

- **条件分支**：根据运行时状态动态选择下一个节点
- **循环**：支持 ReAct 等需要多轮推理的模式
- **中断与恢复**：支持 Human-in-the-Loop，在关键节点暂停等人工确认
- **状态持久化**：通过 Checkpointer 自动保存每个步骤的状态快照

### 核心抽象

```
┌─────────────────────────────────────────────────────┐
│                    StateGraph                        │
│                                                      │
│   状态 (State)   在节点之间流转的共享数据              │
│   节点 (Node)    处理函数 (state) → partial_state     │
│   边 (Edge)      连接节点的路由规则                    │
│                                                     │
│   ┌──────┐   edge   ┌──────┐   cond   ┌──────┐     │
│   │ Node │─────────→│ Node │═══════→│ Node │     │
│   └──────┘          └──────┘         └──────┘     │
│        ↑                               │            │
│        └─────── conditional edge ──────┘            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. 构建一个图

完整的 5 步流程：

```python
from langgraph.graph import StateGraph, END

# Step 1: 定义状态
class MyState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    query: str
    result: str

# Step 2: 创建图构建器
builder = StateGraph(MyState)

# Step 3: 添加节点
builder.add_node("process", process_node)
builder.add_node("generate", generate_node)

# Step 4: 添加边
builder.add_edge("process", "generate")           # 固定边
builder.add_conditional_edges(                     # 条件边
    "grade",
    decide_next,
    {"relevant": "generate", "irrelevant": "rewrite"}
)

# Step 5: 设置出入口并编译
builder.set_entry_point("process")
builder.set_finish_point("generate")
graph = builder.compile()
```

### 调用方式

```python
# 同步调用
result = graph.invoke({"query": "什么是 LangGraph？"})

# 流式调用（逐步获取每个节点的输出）
for chunk in graph.stream({"query": "..."}):
    print(chunk)

# 带配置调用（Checkpointer 必需）
config = {"configurable": {"thread_id": "session-1"}}
result = graph.invoke(initial_state, config)
```

---

## 3. 状态管理

### 3.1 State 定义

使用 `TypedDict` 定义状态结构：

```python
from typing import TypedDict, Annotated
from langgraph.graph.message import add_messages

class RetrievalState(TypedDict):
    # 普通字段：新值直接覆盖旧值
    query: str
    outline: str

    # 带 reducer 的字段：add_messages 会自动追加而非覆盖
    messages: Annotated[list[BaseMessage], add_messages]
```

### 3.2 Reducer 机制

| Reducer | 行为 | 适用场景 |
|---------|------|----------|
| 默认（无 annotation） | 新值**覆盖**旧值 | 单值字段 (query, result) |
| `add_messages` | 新消息**追加**到列表 | 对话历史 |
| 自定义函数 | 自定义合并逻辑 | 累加计数器等 |

```python
# 自定义 reducer 示例：累加而非覆盖
def accumulate(existing: int, new: int) -> int:
    return existing + new

class MyState(TypedDict):
    total_count: Annotated[int, accumulate]
```

### 3.3 节点如何更新状态

节点函数接收完整 state，返回**部分更新**的 dict（只写变化的字段）：

```python
def grade_node(state: ResearcherState) -> dict:
    docs = state["retrieved_docs"]
    # ... 打分逻辑 ...
    return {
        "doc_grades": grades,           # 只返回变化的字段
        "messages": [AIMessage(...)],   # add_messages 会自动追加
    }
    # 未返回的字段保持原值不变
```

---

## 4. 节点

### 4.1 节点函数签名

```python
def my_node(state: StateType) -> dict:
    """
    参数: 完整的图状态
    返回: 部分状态更新的字典（只写变化的字段）
    """
    return {"field_name": new_value}
```

### 4.2 本项目中的节点示例

**简单节点**（只做一件事）：

```python
def finalize_node(state: RetrievalState) -> dict:
    return {
        "final_answer": state["draft_answer"],
        "node_status": "done",
    }
```

**LLM 调用节点**：

```python
def plan_node(state: ResearcherState) -> dict:
    query = state.get("rewritten_query") or state["query"]
    llm = get_llm()
    response = llm.invoke([HumanMessage(content=prompt)])
    # 解析 LLM 输出
    search_queries = [line.strip() for line in response.content.split("\n")]
    return {"search_queries": search_queries}
```

**子图调用节点**：

```python
def research_node(state: RetrievalState) -> dict:
    result = researcher_graph.invoke({"query": state["query"], ...})
    return {
        "retrieved_docs": result["retrieved_docs"],
        "doc_grades": result["doc_grades"],
    }
```

---

## 5. 边

### 5.1 固定边

始终从 A 走向 B：

```python
builder.add_edge("plan", "retrieve")         # plan 之后永远是 retrieve
builder.add_edge("finalize", END)            # 终点
```

### 5.2 条件边

根据状态决定走向：

```python
def decide_after_grade(state) -> Literal["rewrite", "finalize"]:
    grades = state.get("doc_grades", [])
    rewrite_count = state.get("rewrite_count", 0)

    has_relevant = any(g["grade"] in ("relevant", "partial") for g in grades)

    if not has_relevant and rewrite_count < MAX_ATTEMPTS:
        return "rewrite"
    return "finalize"

builder.add_conditional_edges(
    "grade",              # 源节点
    decide_after_grade,   # 决策函数
    {
        "rewrite": "rewrite",     # 返回值 → 目标节点的映射
        "finalize": "finalize",
    },
)
```

### 5.3 条件边防死循环

**这是 LangGraph 开发中最容易出错的点。** 必须满足两个条件之一才能终止循环：

1. **设置最大重试次数**，达到上限强制退出
2. **状态中有明确的终止标志**，如 `done: bool`

本项目的双重保障：

```python
# 保障 1：打分后有 relevant 文档 → 直接退出
if has_relevant:
    return "finalize"

# 保障 2：改写次数达到上限 → 强制退出
if rewrite_count >= MAX_ATTEMPTS:
    return "finalize"
```

---

## 6. 子图

### 6.1 概念

子图 = 将一个编译好的图作为另一个图的节点使用。

```
主图:    [research] → [generate_outline] → [generate_draft] → [finalize]
              │
              └── 内部是完整的 Researcher 子图:
                   [plan] → [retrieve] → [grade] ⇄ [rewrite]
                                              │
                                          [finalize]
```

### 6.2 本项目的实现

```python
# 1. 定义子图（researcher_graph.py）
builder = StateGraph(ResearcherState)
# ... 添加节点和边 ...
researcher_graph = builder.compile()

# 2. 在主图中作为节点使用（retrieval_graph.py）
def research_node(state: RetrievalState) -> dict:
    # 主图状态 → 子图状态的映射
    researcher_input = {
        "query": state["query"],
        "messages": [],
        # ...
    }
    result = researcher_graph.invoke(researcher_input)
    # 子图状态 → 主图状态的映射
    return {
        "retrieved_docs": result.get("retrieved_docs", []),
        "doc_grades": result.get("doc_grades", []),
    }

# 3. 注册为普通节点
builder.add_node("research", research_node)
```

### 6.3 状态映射规则

- 子图可以**读取**主图状态中与子图 State 同名的键
- 子图的输出（return dict）会**合并**回主图状态
- 子图内部有自己的消息历史和状态流转

---

## 7. Human-in-the-Loop (HITL)

### 7.1 中断机制

在编译图时声明中断点：

```python
graph = builder.compile(
    checkpointer=checkpointer,
    interrupt_before=["generate_outline", "generate_draft"],
)
```

中断发生在**指定节点执行之前**，图自动挂起，控制权返回调用方。

### 7.2 检测中断状态

```python
state = graph.get_state(config)
has_interrupt = bool(state.interrupts)  # 是否有挂起的中断
```

### 7.3 恢复执行

```python
from langgraph.types import Command

# 恢复执行，传入人工反馈
graph.invoke(
    Command(resume={"outline_approved": True, "outline_feedback": ""}),
    config,
)
```

### 7.4 完整的 HITL 生命周期

```
1. graph.invoke(initial_state, config)
   → 执行到 interrupt_before 前挂起

2. graph.get_state(config)
   → 检查当前状态，判断挂在哪一步

3. 外部系统（前端）展示审核界面，等待用户操作

4. graph.invoke(Command(resume=user_decision), config)
   → 恢复执行，从挂起点继续

5. 如果还有下一个 interrupt_before，再次挂起（重复步骤 2-4）
```

### 7.5 本项目的 HITL 实现细节

```python
# retrieval_graph.py — 编译时声明两个中断点
graph = builder.compile(
    checkpointer=checkpointer,
    interrupt_before=["generate_outline", "generate_draft"],
)

# api/hitl.py — 审核恢复端点
@router.post("/review")
async def submit_review(request: ReviewRequest):
    graph = get_retrieval_graph()
    config = {"configurable": {"thread_id": request.thread_id}}

    # 更新状态（标记审核结果）
    graph.update_state(config, {
        "outline_approved": True,
        "outline_feedback": request.feedback,
    })

    # 恢复执行
    result = graph.invoke(Command(resume=update), config)
    return result
```

---

## 8. Checkpointer

### 8.1 是什么

Checkpointer 在每个节点执行后自动保存**完整的状态快照**（checkpoint），支持：

- **中断恢复**：挂起后不丢状态
- **错误恢复**：异常后可从中断点继续
- **审计追溯**：每次状态变更可回溯
- **多轮对话**：同一 thread_id 跨请求保持

### 8.2 支持的 Checkpointer 类型

| 类型 | 持久化 | 适用场景 |
|------|--------|----------|
| `MemorySaver` | 否（内存） | 开发调试 |
| `SqliteSaver` | 是（SQLite） | 单机部署 |
| `PostgresSaver` | 是（PostgreSQL） | 生产环境/高并发 |

### 8.3 本项目用法

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = SqliteSaver.from_conn_string("data/checkpoints.db")
graph = builder.compile(checkpointer=checkpointer)

# 通过 thread_id 隔离不同会话
config = {"configurable": {"thread_id": "user-abc-123"}}
graph.invoke(state, config)
```

### 8.4 查看状态历史

```python
# 获取最新状态
state = graph.get_state(config)
print(state.values)

# 获取状态历史（所有 checkpoint）
history = list(graph.get_state_history(config))
for h in history:
    print(h.config, h.values)
```

---

## 9. 常见问题

### Q1: 节点函数中如何访问历史消息？

使用 state 中带 `add_messages` reducer 的 `messages` 字段：

```python
def my_node(state):
    history = state["messages"]     # 完整的对话历史
    last_msg = history[-1]          # 最新一条消息
```

### Q2: 条件边不触发预期的路由？

检查三点：
1. 决策函数的返回值是否在 `{"return_value": "target_node"}` 映射中
2. 返回值的类型标注是否与实际一致（`Literal` 标注有帮助但不强制）
3. 决策函数是否抛了异常（会被静默吞掉，可加 try/except 打印日志）

### Q3: interrupt_before 不生效？

确保编译时传入了 `checkpointer`——没有 checkpointer 就没有中断能力。

### Q4: 如何调试图执行流程？

```python
# 开启调试模式
import langgraph
langgraph.debug = True

# 或逐步执行
for step in graph.stream(state, config):
    print(step)
```

---

## 10. 项目实际结构

### 文件映射

| 文件 | 包含内容 |
|------|----------|
| [states/researcher_state.py](../backend/states/researcher_state.py) | 研究员子图 State 定义 |
| [states/retrieval_state.py](../backend/states/retrieval_state.py) | 检索主图 State 定义 |
| [graph/researcher_graph.py](../backend/graph/researcher_graph.py) | Researcher 子图（Plan→Retrieve→Grade→Rewrite 循环） |
| [graph/retrieval_graph.py](../backend/graph/retrieval_graph.py) | 检索主图（含 HITL + SQLite Checkpointer） |

### 图结构总览

```
RetrievalGraph (主图)
├── research_node ─── 调用 ResearcherGraph (子图)
│
├── generate_outline_node ←── interrupt_before (HITL #1)
│   ├── approve → generate_draft_node
│   ├── edit    → generate_outline_node (循环修订)
│   └── reject  → handle_reject_node → research_node
│
├── generate_draft_node ←── interrupt_before (HITL #2)
│   ├── approve → finalize_node
│   ├── edit    → generate_draft_node (循环修订)
│   └── reject  → handle_reject_node → research_node
│
└── finalize_node → END

ResearcherGraph (子图)
├── plan_node → retrieve_node → grade_node
│   ├── has relevant → finalize_node → END
│   └── all irrelevant
│       ├── rewrite_count < 2 → rewrite_node → plan_node (循环)
│       └── rewrite_count >= 2 → finalize_node → END
```

---

## 延伸资源

- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)
- [LangGraph 概念指南](https://langchain-ai.github.io/langgraph/concepts/)
- [HITL 教程](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/)
- [子图使用指南](https://langchain-ai.github.io/langgraph/how-tos/subgraph/)