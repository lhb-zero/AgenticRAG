# 项目上下文文档

## 1. 项目概览 (Overview)

- **项目名称**：Agentic RAG with HITL（企业级知识库问答系统）
- **项目目标**：构建具备自我纠错检索和多节点人机交互（HITL）能力的企业内部知识库问答系统。用户输入复杂问题，系统自动规划检索、并行检索、给文档打分、如果质量差则自我纠错改写查询重搜，并在生成大纲和最终结论前强制暂停，等待人工确认或修改方向。
- **技术栈**：
  - **后端**：Python 3.11+ / FastAPI / LangChain / LangGraph (StateGraph + Checkpointer) / Uvicorn / FAISS
  - **LLM**：DeepSeek（`deepseek-v4-flash` / `deepseek-v4-pro`），OpenAI 兼容 API，`base_url=https://api.deepseek.com`
  - **Embedding**：本地 Ollama `bge-m3`（主方案），预留云端 embedding 切换接口
  - **向量库**：FAISS（本地持久化到 `backend/data/vectorstore/`）
  - **Checkpointer**：SQLite（持久化到 `backend/data/checkpoints.db`）
  - **前端**：Next.js 14 (App Router) / Tailwind CSS / React Markdown / SSE Token 级流式
  - **端口分配**：后端 8000，前端 3000
  - **环境变量**：`.env` 文件管理 API Key（不暴露到前端）

## 2. 当前进度 (Progress)

### 已完成功能

**后端核心：**
- [x] State Definitions — `RetrievalState`（含 `hallucination_check`）+ `ResearcherState`
- [x] Config & LLM — Pydantic Settings + LLM/Embedding 单例，支持热更新（`reload_llm()`/`reload_embeddings()`）
- [x] Prompt 模板 — 查询规划、改写、文档打分、幻觉检测、大纲生成、答案生成、修订
- [x] FAISS Retriever — 单例向量库、相似度检索、MMR 重排、持久化，Windows 中文路径兼容
- [x] Index Graph — 6 篇中文 Mock 文档，启动自动索引
- [x] Researcher Subgraph — ReAct 循环：Plan → Retrieve → Grade → Rewrite/Decide，最多 2 次改写
- [x] Retrieval Main Graph — HITL 双重中断（`interrupt_after`）+ SQLite Checkpointer + 条件路由
- [x] Token 级 SSE 流式 — `graph.astream_events(version="v2")`，支持 `status/token/outline/draft/done/error` 六种事件
- [x] API Routes — `POST /api/chat`（SSE）、`POST /api/review`（HITL）、`GET /api/history`、`POST /api/index/build`、`POST /api/index/upload`
- [x] Dashboard API — 统计、文档管理（列表/分块查看/删除）、会话管理、链路追踪、模型切换、运行参数
- [x] FastAPI Entry — CORS、4 组路由注册、启动生命周期

**前端核心：**
- [x] Types & API — TypeScript 类型 + SSE 解析（含 event 类型透传）+ Dashboard 全部 API 封装
- [x] 聊天页（`page.tsx`）— Token 级流式渲染（`useRef` + `rAF` 节流）、HITL 审核交互
- [x] ChatMessage — 流式时纯文本+光标动画，结束后 ReactMarkdown 渲染
- [x] OutlineReview — 大纲审核（编辑/批准/打回）
- [x] AnswerReview — 答案审核 + 幻觉检测结果展示（绿色忠实/红色警告）
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

### 关键设计决策

1. **Token 级流式**：`graph.astream_events(version="v2")` 替代 `graph.invoke()`，通过 LangChain 回调机制自动捕获 LLM token，无需修改节点函数。前端用 `requestAnimationFrame` 节流避免高频渲染卡顿。
2. **配置热更新**：修改 `settings` 字段 + `reload_llm()` 清缓存 → 下次调用自动用新配置重建实例。不写 `.env`、不重启。模型切换只改 `deepseek_model`，Key 和 URL 不变。
3. **文档管理**：上传后自动调用 `buildIndex("uploaded")` 构建索引，用户无需手动操作。分块查看用弹窗 + 分页 + 搜索，不是内联展开。
4. **幻觉检测**：`generate_draft_node` 中调用 `_check_hallucination()`，结果存入 state 的 `hallucination_check` 字段，AnswerReview 组件展示。

### 已知问题

- 暗色模式：CSS 有 `dark:` 变量但无切换按钮
- `.env` 中有真实 API Key，注意安全
- 前端无全局状态管理，纯组件内 `useState`

## 3. 核心文件索引 (Key Files)

### 后端

| 文件 | 作用 |
|------|------|
| `backend/main.py` | FastAPI 入口，路由注册（chat/hitl/index/dashboard） |
| `backend/config.py` | Pydantic Settings，`frozen=False` 支持热更新 |
| `backend/llm.py` | LLM/Embedding 单例 + `reload_llm()`/`reload_embeddings()` |
| `backend/states/retrieval_state.py` | 主图状态 TypedDict，含 `hallucination_check` |
| `backend/graph/retrieval_graph.py` | 主图：HITL 中断 + 幻觉检测 + 条件路由 |
| `backend/graph/researcher_graph.py` | 子图：ReAct 循环 |
| `backend/graph/index_graph.py` | 索引构建 + Mock 文档 |
| `backend/api/chat.py` | `POST /api/chat` — Token 级 SSE 流式 |
| `backend/api/hitl.py` | `POST /api/review` + `GET /api/history` |
| `backend/api/index.py` | 文档上传 + 索引构建 |
| `backend/api/dashboard.py` | 管理仪表盘全部 API |
| `backend/tools/retriever.py` | FAISS 向量库工具 |

### 前端

| 文件 | 作用 |
|------|------|
| `frontend/app/page.tsx` | 聊天页：Token 流式渲染 + HITL 审核 |
| `frontend/app/layout.tsx` | 全局布局 |
| `frontend/app/dashboard/layout.tsx` | 仪表盘布局（左侧边栏） |
| `frontend/app/dashboard/page.tsx` | 概览：统计 + 健康检查 |
| `frontend/app/dashboard/documents/page.tsx` | 文档管理：上传/分块弹窗/删除 |
| `frontend/app/dashboard/pipeline/page.tsx` | 链路追踪：流程图 + 详情 |
| `frontend/app/dashboard/sessions/page.tsx` | 会话管理 |
| `frontend/app/dashboard/settings/page.tsx` | 系统配置：模型切换 + 参数调整 |
| `frontend/components/ChatMessage.tsx` | 消息渲染（流式/Markdown 双模式） |
| `frontend/components/OutlineReview.tsx` | 大纲审核 |
| `frontend/components/AnswerReview.tsx` | 答案审核 + 幻觉检测展示 |
| `frontend/components/PipelineDiagram.tsx` | SVG 流程图 |
| `frontend/lib/types.ts` | TypeScript 类型定义 |
| `frontend/lib/api.ts` | API 封装（SSE + Dashboard 全部端点） |

## 4. 待办事项 (Next Steps)

- [ ] 暗色模式切换按钮
- [ ] HITL 审核后也用 SSE 流式（目前 `/api/review` 返回 JSON）
- [ ] 链路追踪增加节点耗时统计
- [ ] 前端错误处理和 loading 状态优化

## 5. 给新会话的 Prompt

```
# 项目上下文恢复

## 基本信息
- **项目**：Agentic RAG with HITL（Python 3.11+ / FastAPI / LangGraph / FAISS / Next.js 14）
- **目录**：`d:\桌面\Ai\agentic-rag`

## 请优先阅读
1. **docs/PROJECT_CONTEXT.md** — 先读这个，了解整体进度和待办

## 当前任务
[在此填写具体任务]
```
