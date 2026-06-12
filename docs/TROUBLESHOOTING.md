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

### ERR-006 | 会话列表显示 unknown（checkpoint 二进制格式）

| 项 | 内容 |
|---|------|
| **错误** | Dashboard 会话管理页面所有字段显示为 `"unknown"` / `"-"` |
| **根因** | `AsyncSqliteSaver` 把 checkpoint 序列化为二进制 blob，`json.loads()` 失败被吞掉 |
| **修复** | 不直接读 SQLite，改用 `graph.aget_state(config)` API 正确反序列化 |
| **教训** | 不要绕过 LangGraph API 直接读 checkpointer 数据库，格式可能随实现变化 |

---

---

### ERR-007 | HITL 大纲审核组件不显示（outline SSE 事件丢失）

| 项 | 内容 |
|---|------|
| **错误** | 大纲生成后前端只显示 `status` 事件（`"处理完成: outline_review"`），OutlineReview 审核组件不渲染 |
| **根因** | `chat.py` 流结束后以 `interrupts` 检测为主条件，但 LangGraph 的 interrupt 对象结构与代码期望不一致，`interrupts` 为空 → 走进 `else` → 只发 `status` 事件，不含 `outline` 数据 |
| **修复** | 以 `node_status` 为主条件判断当前阶段：`outline_review` → 发 `outline` 事件，`answer_review` → 发 `draft` 事件，`done` → 发 `done` 事件 |
| **教训** | 不要依赖 LangGraph 内部的 interrupt 对象结构（可能随版本变化），用 state 中的 `node_status` 作为可靠信号 |

---

### ERR-008 | HITL 审核组件内容重复显示

| 项 | 内容 |
|---|------|
| **错误** | 大纲内容先以 token 流形式显示在消息气泡里，又在 OutlineReview 组件里显示一遍，出现两份 |
| **根因** | `_GENERATING_NODES` 包含 `generate_outline` 和 `generate_draft`，其 LLM 输出被 `on_chat_model_stream` 捕获并流式追加到 `msg.content` |
| **修复** | 从 `_GENERATING_NODES` 中移除这两个节点，大纲/草稿内容只通过 `outline`/`draft` SSE 事件发送给审核组件 |
| **教训** | 需要 HITL 审核的节点不应将内容流式输出到消息气泡，应只通过审核组件展示 |

---

### ERR-009 | 审核组件深色模式下背景黑色、文字不可见

| 项 | 内容 |
|---|------|
| **错误** | OutlineReview / AnswerReview 组件在深色模式下背景为黑色，灰色文字几乎不可见 |
| **根因** | Tailwind `prose` 类（Typography 插件）在深色模式下自动反转颜色，覆盖内联样式的 `backgroundColor` 和 `color`；`dark:bg-yellow-900/20` 透明度太低也导致背景几乎为黑色 |
| **修复** | 去掉 `prose` 类，全部改用内联样式 + 硬编码 hex 色值，不依赖 Tailwind `dark:` 变体 |
| **教训** | `prose` 类会接管子元素的颜色，HITL 审核组件等需要精确控制配色的场景应避免使用 |

---

## 快速索引

| 编号 | 关键词 | 类别 |
|------|--------|------|
| 001 | SqliteSaver, async, NotImplementedError | 异步混用 |
| 002 | from_conn_string, context manager, AttributeError | API 误用 |
| 003 | closed database, __aenter__, ProgrammingError | 资源生命周期 |
| 004 | 404, encodeURIComponent, path param, 特殊字符 | URL 路由 |
| 005 | title, unknown, metadata, loader | 元数据缺失 |
| 006 | unknown, checkpoint, blob, json.loads, 会话列表 | 序列化格式 |
| 007 | outline_review, interrupts, status 事件, HITL 组件不显示 | SSE 事件 |
| 008 | 重复内容, _GENERATING_NODES, token 流, 审核组件 | 流式输出 |
| 009 | prose, dark mode, 黑色背景, 内联样式 | 前端样式 |
