# 项目上下文文档

## 1. 项目概览 (Overview)

- **项目名称**：Agentic RAG with HITL（企业级知识库问答系统）
- **项目目标**：构建具备自我纠错检索和多节点人机交互（HITL）能力的企业内部知识库问答系统。用户输入复杂问题，系统自动规划检索、并行检索、给文档打分、如果质量差则自我纠错改写查询重搜，并在生成大纲和最终结论前强制暂停，等待人工确认或修改方向。
- **技术栈**：
  - **后端**：Python 3.11+ / FastAPI / LangChain / LangGraph (StateGraph + Checkpointer) / Uvicorn / FAISS
  - **LLM**：`deepseek-v4-flash`，OpenAI 兼容 API，`base_url=https://api.deepseek.com`
  - **Embedding**：本地 Ollama `bge-m3`（主方案），预留云端 embedding 切换接口（策略模式）
  - **向量库**：FAISS（本地持久化到 `backend/data/vectorstore/`）
  - **Checkpointer**：SQLite（持久化到 `backend/data/checkpoints.db`）
  - **前端**：Next.js 14 (App Router) / Tailwind CSS / React Markdown / SSE 流式
  - **端口分配**：后端 8000，前端 3000
  - **环境变量**：`.env` 文件管理 API Key

## 2. 当前进度 (Progress)

### 已完成功能

- [x] **State Definitions** (`states/retrieval_state.py`, `states/researcher_state.py`) — 两个 TypedDict 状态体，含 `Annotated[..., add_messages]`
- [x] **Config & LLM 模块** (`config.py`, `llm.py`) — Pydantic Settings 管理环境变量，LLM/Embedding 单例封装，支持 Ollama ↔ 云端切换
- [x] **Prompt 模板** (`prompts/researcher.py`, `grader.py`, `generator.py`) — 5 个角色拆分 Prompt：查询规划、查询改写、文档打分、幻觉检测、大纲生成、答案生成、大纲修订
- [x] **FAISS Retriever** (`tools/retriever.py`) — 单例向量库、相似度检索、MMR 重排、持久化
- [x] **Index Graph** (`graph/index_graph.py`) — 6 篇中文 Mock 文档（LangGraph 架构、企业合规规范等），启动自动索引
- [x] **Researcher Subgraph** (`graph/researcher_graph.py`) — ReAct 循环：Plan → Retrieve → Grade → Rewrite/Decide，条件边防死循环（最多 2 次改写）
- [x] **Retrieval Main Graph** (`graph/retrieval_graph.py`) — 整合子图 + HITL 双重中断 (`interrupt_before=["generate_outline", "generate_draft"]`) + SQLite Checkpointer + `Command(resume=...)` 恢复
- [x] **API Routes** — `POST /api/chat` (SSE 阶段事件流)、`POST /api/review` (HITL 审核恢复)、`GET /api/history/{thread_id}` (状态查询)、`POST /api/index/build` (索引构建)、`POST /api/index/upload` (文档上传)
- [x] **FastAPI Entry** (`main.py`) — CORS、路由注册、启动生命周期（自动索引初始化）
- [x] **前端 Types & API** (`lib/types.ts`, `lib/api.ts`) — TypeScript 类型与后端 State 对齐，SSE + fetch 封装
- [x] **前端组件** — `ChatMessage.tsx`（Markdown 渲染）、`OutlineReview.tsx`（大纲审核面板）、`AnswerReview.tsx`（答案审核面板）
- [x] **前端页面** — `page.tsx`（主聊天界面 + SSE 事件处理 + HITL 审核交互）
- [x] **项目配置** — `.env.example`、`requirements.txt`、`.gitignore`、`package.json`、`tailwind.config.js`、`tsconfig.json`、`docker-compose.yml`、`Dockerfile.backend`、`Dockerfile.frontend`
- [x] **测试** — `test_index_graph.py`（Mock 文档分块测试）、`test_retrieval_graph.py`（状态流转、审核逻辑测试）

### 进行中/暂停点

- **全部代码已生成完毕**，共 39 个文件，目录结构与需求完全对齐。
- **尚未实际运行验证**：需要在配置 `.env`（填入 DEEPSEEK_API_KEY）、确保本地 Ollama 运行 `bge-m3` 后，执行 `pip install -r requirements.txt` + `python main.py` + `cd frontend && npm install && npm run dev` 进行端到端测试。

## 3. 关键决策与逻辑 (Key Decisions)

### 架构决策

1. **LangGraph 多图设计**：
   - **Index Graph**：独立于检索图，负责文档索引构建，不参与运行时检索
   - **Retrieval Graph（主图）**：编排整体流程，作为子图调用 Researcher Graph
   - **Researcher Subgraph（子图）**：独立的 ReAct 循环，共享主图状态中的 `query`、`retrieved_docs` 等键

2. **SSE 流式事件格式**：采用**阶段性事件**而非逐 token 流式，事件类型包括：
   - `status`：状态更新（researching / generating）
   - `outline`：大纲就绪，前端渲染 OutlineReview 组件
   - `draft`：草稿就绪，前端渲染 AnswerReview 组件
   - `done`：最终答案
   - `error`：错误

3. **HITL 挂起/恢复机制**：
   - 通过 `interrupt_before=["generate_outline", "generate_draft"]` 在两个节点前自动挂起
   - 前端检测 `node_status` 字段判断当前阶段并渲染对应的审核组件
   - 后端通过 `graph.update_state(config, update)` + `graph.invoke(Command(resume=update), config)` 恢复执行
   - 审核决策三态：`approve`（批准继续）、`edit`（带反馈修订）、`reject`（打回重做）

4. **Researcher 子图防死循环**：
   - 条件边 `decide_after_grade` 检查 `doc_grades` 中是否有 relevant/partial
   - 条件边 `decide_after_rewrite` 检查 `rewrite_count >= max_rewrite_attempts (2)`
   - 双重保障确保循环必然终止

5. **Embedding 策略模式**：
   - `config.py` 中 `embedding_provider` 控制：`ollama` 用 `OllamaEmbeddings`，`openai`/`deepseek` 用 `OpenAIEmbeddings`
   - `llm.py` 中 `get_embeddings()` 根据配置动态实例化

6. **Checkpointer 选择**：使用 **SQLite (langgraph-checkpoint-sqlite)** 而非 MemorySaver，确保服务重启后状态不丢失。

7. **Mock 文档**：6 篇中文文档覆盖 LangGraph 架构、状态机 API、企业合规（数据安全 + AI 使用政策）、多图编排、知识库建设指南。

### 数据流关键路径

```
用户输入 query
  → POST /api/chat → SSE 建立
  → retrieval_graph.invoke(initial_state, config)
  → research_node → researcher_graph (ReAct loop)
  → [interrupt_before: generate_outline] → SSE: outline 事件 → 前端渲染 OutlineReview
  → 用户审批 → POST /api/review → Command(resume=...) → generate_outline_node
  → [interrupt_before: generate_draft] → SSE: draft 事件 → 前端渲染 AnswerReview
  → 用户审批 → POST /api/review → Command(resume=...) → generate_draft_node
  → finalize_node → SSE: done 事件 → 最终答案
```

## 4. 待办事项 (Next Steps)

- [ ] **环境配置**：在 `backend/` 下创建 `.env` 文件，填入真实的 `DEEPSEEK_API_KEY`
- [ ] **Ollama 确认**：确保本地 Ollama 服务运行且已拉取 `bge-m3` 模型
- [ ] **安装依赖**：`cd backend && pip install -r requirements.txt`，`cd frontend && npm install`
- [ ] **端到端测试**：启动后端 → 启动前端 → 通过 UI 发送查询 → 验证大纲审核/答案审核流程
- [ ] **错误处理增强**：当前 Researcher 子图中 LLM 调用失败时的降级策略较简单（默认 irrelevant），可考虑增加重试或更友好的错误提示
- [ ] **前端暗色模式**：前端组件已预留 `dark:` 样式类，但未实现主题切换开关
- [ ] **幻觉检测集成**：`HALLUCINATION_GRADER_PROMPT` 已编写且 `generate_draft_node` 中调用 `_check_hallucination`，但检测结果仅记录在 messages 中，前端未显式展示
- [ ] **文档上传后自动索引**：当前上传仅保存文件，需手动调用 `/api/index/build?source=uploaded`
- [ ] **生产环境 Checkpointer**：当前用 SQLite，如需高并发可迁移到 PostgresSaver

## 5. 核心文件索引 (Key Files)

### 后端核心

- `backend/main.py` — FastAPI 应用入口，CORS、路由注册、启动索引初始化
- `backend/config.py` — Pydantic Settings，所有可配置参数（LLM/Embedding/向量库/HITL）
- `backend/llm.py` — LLM 和 Embedding 单例封装，策略模式支持 Ollama ↔ 云端切换
- `backend/states/retrieval_state.py` — 检索主图状态 TypedDict，含 20+ 字段（HITL 中断信号）
- `backend/states/researcher_state.py` — 研究员子图状态 TypedDict，ReAct 循环流转
- `backend/graph/retrieval_graph.py` — **核心**：主图构建，含 HITL 双重中断 + SQLite Checkpointer + 条件路由
- `backend/graph/researcher_graph.py` — 研究员子图 ReAct 循环，Plan→Retrieve→Grade→Rewrite/Decide
- `backend/graph/index_graph.py` — 索引构建 + 6 篇 Mock 文档 + 分块 + FAISS 持久化
- `backend/api/chat.py` — POST /api/chat，SSE 阶段事件流式响应
- `backend/api/hitl.py` — POST /api/review + GET /api/history/{thread_id}，HITL 审核恢复
- `backend/api/index.py` — POST /api/index/build + POST /api/index/upload
- `backend/tools/retriever.py` — FAISS 向量库单例 + 相似度检索 + MMR 重排
- `backend/prompts/researcher.py` — 查询规划 + 查询改写 Prompt 模板
- `backend/prompts/grader.py` — 文档相关性打分 + 幻觉检测 Prompt 模板
- `backend/prompts/generator.py` — 大纲生成 + 大纲修订 + 答案生成 Prompt 模板
- `backend/tests/test_index_graph.py` — 索引图单元测试（文档分块、字段验证）
- `backend/tests/test_retrieval_graph.py` — 检索图单元测试（状态流转、审核逻辑）

### 前端核心

- `frontend/app/page.tsx` — **核心**：主聊天页面，SSE 事件处理 + HITL 审核交互逻辑
- `frontend/components/OutlineReview.tsx` — 大纲审核组件（编辑/批准/打回三种操作）
- `frontend/components/AnswerReview.tsx` — 答案审核组件（修改意见/确认/打回三种操作）
- `frontend/components/ChatMessage.tsx` — 消息渲染组件（react-markdown）
- `frontend/lib/types.ts` — TypeScript 类型定义，与后端 API 契约对齐
- `frontend/lib/api.ts` — fetch + SSE 流式封装，`sendChatMessage` / `submitReview` / `getHistory`
- `frontend/app/layout.tsx` — 全局布局，html lang="zh-CN"
- `frontend/app/globals.css` — Tailwind 指令 + 自定义滚动条 + 动画

### 配置文件

- `backend/.env.example` — 环境变量模板（DEEPSEEK_API_KEY / Ollama / 向量库参数）
- `backend/requirements.txt` — Python 依赖清单（LangChain / LangGraph / FAISS / FastAPI）
- `frontend/package.json` — Node.js 依赖（Next.js 14 / React 18 / Tailwind / react-markdown）
- `.gitignore` — Git 忽略规则（.env / data/ / node_modules / __pycache__）
- `docker-compose.yml` — Docker 编排（backend + frontend）
- `Dockerfile.backend` — Python slim 镜像 + uvicorn
- `Dockerfile.frontend` — Node multi-stage + standalone 输出

---

## 六、给新会话的 Prompt 模板

新开会话时，复制以下内容作为首条消息（替换 `[任务]` 部分）：

---

# 项目上下文恢复

## 基本信息
- **项目**：Agentic RAG with HITL（Python 3.11+ / FastAPI / LangGraph / FAISS / Next.js 14）
- **目录**：`d:\桌面\Ai\agentic-rag`

## 请优先阅读
1. **docs/PROJECT_CONTEXT.md** — 先读这个，了解整体进度和待办

## 当前任务
[在此填写具体任务]

---