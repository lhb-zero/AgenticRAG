# 项目上下文文档

## 1. 项目概览 (Overview)

- **项目名称**：Agentic RAG with HITL（企业级知识库问答系统）
- **项目目标**：构建具备自我纠错检索和多节点人机交互（HITL）能力的企业内部知识库问答系统。用户输入复杂问题，系统自动规划检索、并行检索、给文档打分、如果质量差则自我纠错改写查询重搜，并在生成大纲和最终结论前强制暂停，等待人工确认或修改方向。
- **技术栈**：
  - **后端**：Python 3.11+ / FastAPI / LangChain / LangGraph (StateGraph + Checkpointer) / Uvicorn / FAISS
  - **LLM**：DeepSeek（`deepseek-v4-flash` / `deepseek-v4-pro`），OpenAI 兼容 API，`base_url=https://api.deepseek.com`
  - **Embedding**：本地 Ollama `bge-m3`（主方案），预留云端 embedding 切换接口
  - **向量库**：FAISS（本地持久化到 `backend/data/vectorstore/`）
  - **Checkpointer**：AsyncSqliteSaver + aiosqlite（持久化到 `backend/data/checkpoints.db`）
  - **前端**：Next.js 14 (App Router) / Tailwind CSS + @tailwindcss/typography / React Markdown / SSE Token 级流式
  - **端口分配**：后端 8000，前端 3000
  - **环境变量**：`.env` 文件管理 API Key（不暴露到前端）

## 2. 当前进度 (Progress)

### 已完成功能

**后端核心：**
- [x] State Definitions — `RetrievalState`（含 `hallucination_check` + `is_chitchat`）+ `ResearcherState`
- [x] Config & LLM — Pydantic Settings + LLM/Embedding 单例，支持热更新（`reload_llm()`/`reload_embeddings()`）
- [x] Prompt 模板 — 查询分类、查询规划、改写、文档打分、幻觉检测、大纲生成、答案生成、修订
- [x] FAISS Retriever — 单例向量库、相似度检索、MMR 重排、持久化，Windows 中文路径兼容
- [x] Index Graph — Mock 文档 + 上传文件索引（自动设置 title 元数据）
- [x] Researcher Subgraph — ReAct 循环：Plan → Retrieve → Grade → Rewrite/Decide，最多 2 次改写
- [x] Retrieval Main Graph — AsyncSqliteSaver + HITL 双重中断 + 条件路由
- [x] 查询分类器 — `classify_query_node`，闲聊直接回复不走 RAG 检索
- [x] Token 级 SSE 流式 — `graph.astream_events(version="v2")`，支持 `status/token/outline/draft/done/error` 六种事件
- [x] API Routes — `POST /api/chat`（SSE）、`POST /api/review`（HITL）、`GET /api/history`、`POST /api/index/build`、`POST /api/index/upload`
- [x] Dashboard API — 统计、文档管理（列表/分块查看/删除）、会话管理、链路追踪、模型切换、运行参数
- [x] FastAPI Entry — CORS、4 组路由注册、启动生命周期

**前端核心：**
- [x] Types & API — TypeScript 类型 + SSE 解析（含 event 类型透传）+ Dashboard 全部 API 封装
- [x] 三栏布局 — 侧边栏（会话列表）+ 主内容区（对话/欢迎页）+ 底部输入区
- [x] 侧边栏 — 新对话、会话列表、三点菜单（重命名/删除/移动到分组）、管理后台入口
- [x] 会话分组 — 创建/重命名/删除分组、将会话移动到分组、折叠/展开分组
- [x] Glassmorphism UI — 毛玻璃效果（header/input/sidebar）、渐变背景、微动画、浮动光斑
- [x] 欢迎页 — 渐变 Logo 浮动动画 + 4 个彩色图标快捷提问卡片 + 背景装饰光斑
- [x] ChatInput 组件 — 自适应高度 textarea + 渐变发送按钮 + 聚焦发光
- [x] StatusBadge 组件 — 带脉冲动画的彩色状态指示器
- [x] 聊天页（`page.tsx`）— Token 级流式渲染（`useRef` + `rAF` 节流）、HITL 审核交互
- [x] ChatMessage — 用户气泡渐变蓝紫 + 助手消息半透明玻璃底 + 消息入场动画 + Markdown 深度样式
- [x] OutlineReview — 大纲审核（编辑/批准/打回）
- [x] AnswerReview — 答案审核 + 幻觉检测结果展示（绿色忠实/红色警告）
- [x] 会话 localStorage 持久化 — 自动保存/恢复/重命名/删除/分组
- [x] 管理仪表盘 — `/dashboard` 路由，5 个子页面：

**仪表盘页面：**
- [x] 概览（`/dashboard`）— 统计卡片 + 系统健康检查（LLM/Embedding/FAISS）+ 文档预览
- [x] 文档管理（`/dashboard/documents`）— 上传（自动索引）、分块弹窗（分页+搜索）、删除
- [x] 链路追踪（`/dashboard/pipeline`）— 会话列表 + SVG 流程图 + 执行详情（检索计划/文档打分/幻觉检测）
- [x] 会话管理（`/dashboard/sessions`）— 会话列表 + 删除
- [x] 系统配置（`/dashboard/settings`）— DeepSeek 模型切换（V4 Flash/Pro）+ 运行参数滑块 + 测试连接

**其他：**
- [x] PipelineDiagram 组件 — 纯 SVG 可视化，节点高亮+脉冲动画
- [x] 测试 — `test_index_graph.py`、`test_retrieval_graph.py`
- [x] Docker — `docker-compose.yml` + 两个 Dockerfile
- [x] 文档 — `FLOWCHART.md`（Mermaid 流程图）、`TROUBLESHOOTING.md`（排查修复记录）

### 关键设计决策

1. **查询分类**：`classify_query_node` 用 LLM 判断输入是闲聊还是知识问题。闲聊走 `direct_reply` 直接回复，不触发 RAG 检索流程，节省 token 和时间。
2. **Token 级流式**：`graph.astream_events(version="v2")` 替代 `graph.invoke()`，通过 LangChain 回调机制自动捕获 LLM token，无需修改节点函数。前端用 `requestAnimationFrame` 节流避免高频渲染卡顿。
3. **全异步 Checkpointer**：`astream_events` 要求 checkpointer 实现异步方法，因此从 `SqliteSaver` 迁移到 `AsyncSqliteSaver`，手动管理 `aiosqlite.Connection` 生命周期。
4. **配置热更新**：修改 `settings` 字段 + `reload_llm()` 清缓存 → 下次调用自动用新配置重建实例。不写 `.env`、不重启。模型切换只改 `deepseek_model`，Key 和 URL 不变。
5. **文档管理**：上传后自动调用 `buildIndex("uploaded")` 构建索引，加载时自动补充 `title` 元数据。分块查看用弹窗 + 分页 + 搜索，不是内联展开。
6. **URL 路由**：文档标题可能含特殊字符（`/`、`#`、`=`），因此分块查询和删除端点使用 query param 而非 path param。
7. **幻觉检测**：`generate_draft_node` 中调用 `_check_hallucination()`，结果存入 state 的 `hallucination_check` 字段，AnswerReview 组件展示。
8. **会话列表读取**：`AsyncSqliteSaver` 的 checkpoint 是二进制 blob，不能直接 `json.loads()`。必须通过 `graph.aget_state()` API 读取，才能正确反序列化。
9. **Glassmorphism 设计**：使用 `backdrop-blur` + 半透明背景 + 渐变色实现毛玻璃效果。全局背景用渐变（蓝紫微调），输入框/头部/侧边栏统一使用 `glass` 工具类。
10. **FAISS 向量库选型**：选用 FAISS 而非 Milvus/Weaviate 等数据库方案，原因：①项目为单机原型，文档量级在万级以下，FAISS 性能足够；②零运维成本，`pip install` 即用，无需部署额外服务；③与 LangChain 深度集成，API 简洁。局限：①不支持原生 CRUD，删除文档需重建整个索引；②数据保存为本地文件（`.faiss` + `.pkl`），无内置备份/高可用；③单进程加载，百万级索引冷启动慢。生产环境迁移路径：Milvus（分布式）/ Qdrant（轻量级 Rust 实现）/ ChromaDB（嵌入式，类似 FAISS 定位但支持 CRUD）。

### 已知问题

- 暗色模式：CSS 有 `dark:` 变量但无切换按钮
- `.env` 中有真实 API Key，注意安全
- 前端无全局状态管理，纯组件内 `useState`
- HITL 审核后恢复执行（`/api/review`）用的是 `ainvoke` 同步调用，不走 SSE 流式，链路追踪页面无法记录后续节点执行（待办：HITL 审核后也用 SSE 流式）

### 最近修复

- **HITL 审核组件不显示**（ERR-007）：`chat.py` 流结束后以 `interrupts` 检测为主条件导致 `outline` 事件未发送，改为以 `node_status` 为主条件
- **审核内容重复**（ERR-008）：`generate_outline`/`generate_draft` 的 token 被流式追加到消息气泡，从 `_GENERATING_NODES` 中移除
- **审核组件深色模式黑底**（ERR-009）：`prose` 类覆盖内联样式，去掉 `prose` 改用纯内联样式 + hex 色值

## 3. 核心文件索引 (Key Files)

### 后端

| 文件 | 作用 |
|------|------|
| `backend/main.py` | FastAPI 入口，路由注册（chat/hitl/index/dashboard） |
| `backend/config.py` | Pydantic Settings，`frozen=False` 支持热更新 |
| `backend/llm.py` | LLM/Embedding 单例 + `reload_llm()`/`reload_embeddings()` |
| `backend/states/retrieval_state.py` | 主图状态 TypedDict，含 `hallucination_check` + `is_chitchat` |
| `backend/graph/retrieval_graph.py` | 主图：分类器 + AsyncSqliteSaver + HITL 中断 + 幻觉检测 |
| `backend/graph/researcher_graph.py` | 子图：ReAct 循环 |
| `backend/graph/index_graph.py` | 索引构建 + Mock 文档 + 上传文档 title 元数据补充 |
| `backend/api/chat.py` | `POST /api/chat` — Token 级 SSE 流式 |
| `backend/api/hitl.py` | `POST /api/review` + `GET /api/history` |
| `backend/api/index.py` | 文档上传 + 索引构建 |
| `backend/api/dashboard.py` | 管理仪表盘全部 API |
| `backend/tools/retriever.py` | FAISS 向量库工具 |
| `backend/prompts/researcher.py` | 查询分类 + 查询规划 + 改写 prompt |
| `backend/prompts/generator.py` | 大纲生成 + 答案生成 + 修订 prompt |
| `backend/prompts/grader.py` | 文档打分 + 幻觉检测 prompt |

### 前端

| 文件 | 作用 |
|------|------|
| `frontend/app/page.tsx` | 聊天页：三栏布局 + 会话管理 + Token 流式 + HITL 审核 |
| `frontend/app/layout.tsx` | 全局布局（h-full） |
| `frontend/app/globals.css` | 全局样式 + 流式光标动画 + Markdown 样式 |
| `frontend/app/dashboard/layout.tsx` | 仪表盘布局（左侧边栏） |
| `frontend/app/dashboard/page.tsx` | 概览：统计 + 健康检查 |
| `frontend/app/dashboard/documents/page.tsx` | 文档管理：上传/分块弹窗/删除 |
| `frontend/app/dashboard/pipeline/page.tsx` | 链路追踪：流程图 + 详情 |
| `frontend/app/dashboard/sessions/page.tsx` | 会话管理 |
| `frontend/app/dashboard/settings/page.tsx` | 系统配置：模型切换 + 参数调整 |
| `frontend/components/ChatMessage.tsx` | 消息渲染（流式/Markdown 双模式 + 淡色背景） |
| `frontend/components/ChatInput.tsx` | 输入区：自适应高度 + 发送按钮 |
| `frontend/components/Sidebar.tsx` | 侧边栏：会话列表 + 三点菜单（重命名/删除） |
| `frontend/components/WelcomeScreen.tsx` | 欢迎页：Logo + 快捷提问 |
| `frontend/components/StatusBadge.tsx` | 状态指示器（脉冲动画） |
| `frontend/components/OutlineReview.tsx` | 大纲审核 |
| `frontend/components/AnswerReview.tsx` | 答案审核 + 幻觉检测展示 |
| `frontend/components/PipelineDiagram.tsx` | SVG 流程图 |
| `frontend/lib/types.ts` | TypeScript 类型定义 |
| `frontend/lib/api.ts` | API 封装（SSE + Dashboard 全部端点） |
| `frontend/lib/conversation.ts` | 会话 localStorage 存储管理器 |

## 4. 待办事项 (Next Steps)

- [ ] 暗色模式切换按钮
- [ ] HITL 审核后也用 SSE 流式（目前 `/api/review` 返回 JSON）
- [ ] 链路追踪增加节点耗时统计
- [ ] 前端错误处理和 loading 状态优化
- [ ] 会话列表搜索/过滤功能
- [ ] 文档上传支持更多格式（xlsx、pptx）

## 5. 给新会话的 Prompt

```
# 项目上下文恢复

## 基本信息
- **项目**：Agentic RAG with HITL（Python 3.11+ / FastAPI / LangGraph / FAISS / Next.js 14）
- **目录**：`d:\桌面\Ai\agentic-rag`

## 请优先阅读
1. **docs/PROJECT_CONTEXT.md** — 先读这个，了解整体进度和待办
2. **docs/TROUBLESHOOTING.md** — 排查修复记录，避免重复踩坑
3. **docs/FLOWCHART.md** — 对话流程图，理解数据流

## 当前任务
[在此填写具体任务]
```
