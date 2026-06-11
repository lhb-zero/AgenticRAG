# 排查与修复记录

> 每条错误一个表格条目，快速查阅。按时间正序排列。

---

## 错误条目

### ERR-001 | SqliteSaver 不支持异步

| 项 | 内容 |
|---|------|
| **错误** | `NotImplementedError: SqliteSaver does not support async methods` |
| **根因** | `astream_events` 调 checkpointer 的异步方法，但用的是同步 `SqliteSaver` |
| **修复** | 换 `AsyncSqliteSaver`，所有 `get_state`/`update_state`/`invoke` 改 `aget_state`/`aupdate_state`/`ainvoke` |
| **教训** | `astream_events` 必须配异步 checkpointer，`invoke` 才能用同步的 |

---

### ERR-002 | AsyncSqliteSaver 初始化失败

| 项 | 内容 |
|---|------|
| **错误** | `AttributeError: '_AsyncGeneratorContextManager' has no attribute 'setup'` |
| **根因** | `from_conn_string()` 返回 async context manager，不是实例 |
| **修复** | `await aiosqlite.connect()` + `AsyncSqliteSaver(conn)` + `await setup()` |
| **教训** | `from_conn_string` 是 `@asynccontextmanager`，不能当构造函数用 |

---

### ERR-003 | aiosqlite 连接被提前关闭

| 项 | 内容 |
|---|------|
| **错误** | `ProgrammingError: Cannot operate on a closed database` |
| **根因** | 手动 `__aenter__()` 绕过 context manager，`__aexit__` 在 GC 时关掉了连接 |
| **修复** | 手动 `await aiosqlite.connect()` 创建连接，传给 `AsyncSqliteSaver(conn)` |
| **教训** | 不要手动调 `__aenter__`，需要持久资源就自己管生命周期 |

---

### ERR-004 | 文档分块查询 404（特殊字符）

| 项 | 内容 |
|---|------|
| **错误** | `GET /api/dashboard/documents/xxx%23/chunks` → 404 |
| **根因** | 文件名含 `/` `#` `=` 等字符，作为 path param 被 Starlette 解码后破坏路由 |
| **修复** | path param → query param：`/documents/chunks?title=...`，前后端同步改 |
| **教训** | 用户输入永远不要放 URL path，用 query param 或 body |

---

### ERR-005 | 上传文档 title 全是 unknown

| 项 | 内容 |
|---|------|
| **错误** | 文档列表中所有上传文档显示为 `"unknown"`，无法按名查分块 |
| **根因** | LangChain loader 只设 `source`，不设 `title` 元数据 |
| **修复** | `index_graph.py` 加载后补 `doc.metadata["title"] = 文件名去扩展名` |
| **教训** | loader 的 metadata 不含业务字段，加载后要主动补充 |

---

## 快速索引

| 编号 | 关键词 | 类别 |
|------|--------|------|
| 001 | SqliteSaver, async, NotImplementedError | 异步混用 |
| 002 | from_conn_string, context manager, AttributeError | API 误用 |
| 003 | closed database, __aenter__, ProgrammingError | 资源生命周期 |
| 004 | 404, encodeURIComponent, path param, 特殊字符 | URL 路由 |
| 005 | title, unknown, metadata, loader | 元数据缺失 |
