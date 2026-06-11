# SQLite Checkpointer 专项

> LangGraph 状态持久化 — 中断恢复 / 多轮会话 / 审计追溯

---

## 目录

- [1. 基本概念](#1-基本概念)
- [2. 三种 Checkpointer 对比](#2-三种-checkpointer-对比)
- [3. 工作原理](#3-工作原理)
- [4. 本项目的实现](#4-本项目的实现)
- [5. 状态查询与调试](#5-状态查询与调试)
- [6. 迁移到 Postgres](#6-迁移到-postgres)
- [7. 常见问题](#7-常见问题)

---

## 1. 基本概念

Checkpointer 是 LangGraph 的**自动快照机制**，在每个节点执行后保存完整状态到持久化存储。

### 核心能力

```
Node A 执行 → Checkpointer 保存 State v1
Node B 执行 → Checkpointer 保存 State v2
[interrupt]  → 挂起，State v2 持久化到 SQLite
     ↓ (服务重启、用户离开)
外部恢复     → 从 SQLite 读取 State v2
Node C 执行 → Checkpointer 保存 State v3
```

### 为什么需要持久化

| 场景 | MemorySaver | SqliteSaver |
|------|-------------|-------------|
| 正常执行 | 正常 | 正常 |
| 服务重启 | 状态丢失 | 状态恢复 |
| HITL 挂起后用户离开 | 页面刷新后无法恢复 | 随时恢复 |
| 多个服务实例 | 不共享 | 可用同一文件 |
| 审计追溯 | 不持久 | 完整历史 |

---

## 2. 三种 Checkpointer 对比

| | MemorySaver | SqliteSaver | PostgresSaver |
|---|---|---|---|
| 包名 | `langgraph` 内置 | `langgraph-checkpoint-sqlite` | `langgraph-checkpoint-postgres` |
| 持久化 | 否 | 是 | 是 |
| 安装难度 | 无 | `pip install` | 需 Postgres 服务 |
| 并发支持 | 单进程 | 单机 | 多实例 |
| 适用 | 开发测试 | 单机部署 | 生产环境 |

### 本项目的选择

**SqliteSaver** — 持久化 + 零外部依赖，适合开发到单机部署。

### 安装

```bash
pip install langgraph-checkpoint-sqlite
```

---

## 3. 工作原理

### 3.1 每次节点执行 = 一次 checkpoint

```
invoke(state, config)
  │
  ├─→ Node "research" 执行
  │     └─→ checkpoint #1 写入
  │
  ├─→ Node "generate_outline" 之前
  │     └─→ [interrupt_before 挂起]
  │     └─→ checkpoint #2 写入（含 interrupts 信息）
  │
  ├─→ 用户审批后 invoke(Command(resume=...), config)
  │
  ├─→ 从 checkpoint #2 恢复
  │
  ├─→ Node "generate_outline" 执行
  │     └─→ checkpoint #3 写入
  │
  └─→ ... 继续 ...
```

### 3.2 thread_id 的作用

```python
config = {"configurable": {"thread_id": "user-session-abc"}}
```

- **相同 thread_id** → 恢复之前的执行状态（多轮对话）
- **不同 thread_id** → 全新的独立会话

**本项目中的映射**：每个用户会话 = 一个 thread_id = 一条独立的执行链。

### 3.3 状态更新（update_state）

```python
# 在恢复前更新状态（注入人工反馈）
graph.update_state(config, {
    "outline_approved": True,
    "outline_feedback": "请补充数据安全方面",
})
```

`update_state` 相当于在当前 checkpoint 上打一个补丁，不执行任何节点。

---

## 4. 本项目的实现

### 4.1 Checkpointer 初始化

```python
# graph/retrieval_graph.py
from langgraph.checkpoint.sqlite import SqliteSaver
from config import settings

def _get_checkpointer():
    db_path = settings.checkpointer_db_path  # data/checkpoints.db
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    return SqliteSaver.from_conn_string(db_path)

# 编译时传入
graph = builder.compile(
    checkpointer=_get_checkpointer(),
    interrupt_before=["generate_outline", "generate_draft"],
)
```

### 4.2 每次请求使用相同 thread_id

```python
# api/chat.py
config = {"configurable": {"thread_id": thread_id}}

# 首次调用：初始状态
result = graph.invoke(initial_state, config)

# 后续调用：自动恢复之前的进度
result = graph.invoke(Command(resume=update), config)
```

### 4.3 HITL 恢复流程

```python
# api/hitl.py
@router.post("/review")
async def submit_review(request: ReviewRequest):
    config = {"configurable": {"thread_id": request.thread_id}}
    graph = get_retrieval_graph()

    # Step 1: 更新状态（注入人工决策）
    graph.update_state(config, {
        "outline_approved": True,
        "outline_feedback": "",
    })

    # Step 2: 恢复执行
    result = graph.invoke(Command(resume={"outline_approved": True}), config)
    return result
```

### 4.4 数据库文件

```bash
ls backend/data/
# checkpoints.db        ← SQLite 主文件
# checkpoints.db-wal    ← Write-Ahead Log
# checkpoints.db-shm    ← 共享内存文件
```

这三个文件共同组成一个 SQLite 数据库，`.gitignore` 中已忽略。

---

## 5. 状态查询与调试

### 5.1 获取当前状态

```python
state = graph.get_state(config)

# 当前状态的值
state.values          # dict: {"query": "...", "outline": "...", ...}

# 是否挂起
state.interrupts      # 有值 = 挂起等待中

# checkpoint 元数据
state.config          # 当前 checkpoint 的配置
state.metadata        # 时间戳、步骤数等
```

### 5.2 获取完整状态历史

```python
# 查看所有 checkpoint（按时间倒序）
history = list(graph.get_state_history(config))

for h in history:
    print(f"Step {h.metadata.get('step')}: {list(h.values.keys())}")
```

### 5.3 本项目的 API 暴露

```python
# GET /api/history/{thread_id}
@router.get("/history/{thread_id}")
async def get_history(thread_id: str):
    state = graph.get_state(config)
    return {
        "node_status": state.values.get("node_status"),
        "has_interrupt": bool(state.interrupts),
        "outline": state.values.get("outline"),
        "draft_answer": state.values.get("draft_answer"),
        ...
    }
```

---

## 6. 迁移到 Postgres

当并发量增大、需要多实例部署时，可以迁移到 PostgresSaver。

### 6.1 安装

```bash
pip install langgraph-checkpoint-postgres
```

### 6.2 代码变更

```python
# 只需改这一行
from langgraph.checkpoint.postgres import PostgresSaver

# 初始化
DB_URI = "postgresql://user:pass@host:5432/dbname"
checkpointer = PostgresSaver.from_conn_string(DB_URI)
checkpointer.setup()  # 首次需初始化表结构

# 编译使用（接口完全一致）
graph = builder.compile(
    checkpointer=checkpointer,
    interrupt_before=["generate_outline", "generate_draft"],
)
```

### 6.3 数据迁移

从 SQLite 到 Postgres 需要导出 → 导入检查点数据，LangGraph 目前不提供内置迁移工具，一般在新部署时使用 Postgres。

---

## 7. 常见问题

### Q1: 数据库文件越来越大怎么办？

SqliteSaver 会保留所有历史 checkpoint。可以定期清理：

```python
# 只保留最近的 N 个 checkpoint
# (LangGraph 当前版本不直接支持，需手动管理)
```

生产环境可以考虑设置数据保留策略或在 Postgres 中创建定时清理任务。

### Q2: 并发访问 SQLite 有问题吗？

SQLite 支持并发读，但写操作是串行的。单机部署一般没问题，多实例部署建议升级到 Postgres。

### Q3: 如何删除某个会话的状态？

```python
# SqliteSaver 没有直接的 delete API
# 可以手动删除 SQLite 中的数据
import sqlite3
conn = sqlite3.connect("data/checkpoints.db")
conn.execute("DELETE FROM checkpoints WHERE thread_id = ?", ("abc-123",))
conn.commit()
conn.close()
```

### Q4: 服务重启后能自动恢复未完成的会话吗？

能。Checkpointer 将状态持久化到磁盘，重启后 `graph.get_state(config)` 仍能读取。

---

## 项目文件索引

| 文件 | 内容 |
|------|------|
| [config.py](../backend/config.py) | checkpointer_db_path 配置 |
| [graph/retrieval_graph.py](../backend/graph/retrieval_graph.py) | SqliteSaver 初始化 + interrupt_before |
| [api/hitl.py](../backend/api/hitl.py) | update_state + Command(resume=...) 恢复 |
| [api/chat.py](../backend/api/chat.py) | graph.invoke(initial_state, config) |
| [.gitignore](../.gitignore) | 忽略 checkpoints.db* |

## 延伸资源

- [LangGraph Persistence 文档](https://langchain-ai.github.io/langgraph/concepts/persistence/)
- [LangGraph HITL 教程](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/)
- [SQLite 官方文档](https://www.sqlite.org/docs.html)