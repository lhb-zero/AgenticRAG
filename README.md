# Agentic RAG — 企业级知识库问答系统

具备自我纠错检索和人机交互（HITL）能力的 RAG 系统。用户输入复杂问题后，系统自动规划检索、并行检索、给文档打分、自我纠错改写查询重搜，并在生成大纲和最终答案前强制暂停，等待人工确认或修改方向。

## 核心特性

- **Agentic RAG**：Research 子图（ReAct 循环）自动规划 → 检索 → 打分 → 改写，最多重试 2 次
- **HITL 人工审核**：大纲审核 + 答案审核双重中断，支持批准 / 编辑 / 打回三种操作
- **幻觉检测**：生成答案后自动检测是否忠实于检索文档，结果可视化展示
- **查询分类**：闲聊直接回复，知识问题走 RAG 流程，节省 token
- **Token 级流式**：基于 `astream_events` 的 SSE 流式输出，前端逐字渲染
- **会话管理**：分组、重命名、删除、localStorage 持久化
- **管理仪表盘**：文档管理、链路追踪、会话管理、系统配置、健康检查

## 技术栈

| 层 | 技术 |
|---|------|
| **后端** | Python 3.11+ / FastAPI / LangGraph / FAISS |
| **前端** | Next.js 14 (App Router) / Tailwind CSS / React Markdown |
| **LLM** | DeepSeek (deepseek-v4-flash / deepseek-v4-pro) |
| **Embedding** | 本地 Ollama bge-m3 |
| **Checkpointer** | AsyncSqliteSaver (aiosqlite) |
| **容器化** | Docker Compose |

## 快速开始

### 前置条件

- Python 3.11+
- Node.js 18+
- Ollama（本地运行 bge-m3 embedding 模型）
- DeepSeek API Key

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
# 编辑 .env，填入 DEEPSEEK_API_KEY
```

### 2. 启动 Embedding 服务

```bash
ollama pull bge-m3
ollama serve
```

### 3. 启动后端

```bash
cd backend
pip install -r requirements.txt
python main.py
# 后端运行在 http://localhost:8000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
# 前端运行在 http://localhost:3000
```

### Docker 一键启动

```bash
docker-compose up --build
```

## 项目结构

```
agentic-rag/
├── backend/
│   ├── main.py                  # FastAPI 入口
│   ├── config.py                # Pydantic Settings 配置
│   ├── llm.py                   # LLM / Embedding 单例
│   ├── api/
│   │   ├── chat.py              # POST /api/chat (SSE 流式)
│   │   ├── hitl.py              # POST /api/review (HITL 审核)
│   │   ├── index.py             # 文档上传 / 索引构建
│   │   └── dashboard.py         # 管理仪表盘 API
│   ├── graph/
│   │   ├── retrieval_graph.py   # 主图：分类 → 研究 → 大纲 → 草稿 → 最终化
│   │   ├── researcher_graph.py  # 子图：Plan → Retrieve → Grade → Rewrite
│   │   └── index_graph.py       # 索引构建图
│   ├── states/                  # LangGraph State 定义
│   ├── prompts/                 # Prompt 模板
│   ├── tools/                   # FAISS Retriever 工具
│   └── data/                    # 向量库 + Checkpoint 数据库
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # 聊天主页面
│   │   └── dashboard/           # 管理仪表盘 (5 个子页面)
│   ├── components/
│   │   ├── ChatMessage.tsx      # 消息渲染
│   │   ├── OutlineReview.tsx    # 大纲审核组件
│   │   ├── AnswerReview.tsx     # 答案审核组件
│   │   └── ...
│   └── lib/
│       ├── api.ts               # API 封装 (SSE + Dashboard)
│       ├── types.ts             # TypeScript 类型
│       └── conversation.ts      # 会话 localStorage 管理
└── docs/
    ├── PROJECT_CONTEXT.md       # 项目进度与设计决策
    ├── TROUBLESHOOTING.md       # 排查修复记录
    └── FLOWCHART.md             # 对话流程图
```

## 对话流程

```
用户消息 → 查询分类器
  ├─ 闲聊 → 直接回复
  └─ 知识问题 → Research 子图 (ReAct 循环)
       → 生成大纲 → [HITL: 大纲审核]
       → 生成草稿 + 幻觉检测 → [HITL: 答案审核]
       → 最终输出
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/chat` | SSE 流式对话 |
| `POST` | `/api/review` | HITL 审核提交 |
| `GET` | `/api/history/{thread_id}` | 会话状态查询 |
| `POST` | `/api/index/upload` | 文档上传 |
| `POST` | `/api/index/build` | 索引构建 |
| `GET` | `/api/dashboard/stats` | 仪表盘统计 |
| `GET` | `/api/dashboard/documents` | 文档管理 |
| `GET` | `/api/dashboard/trace/{thread_id}` | 链路追踪 |
| `GET` | `/api/dashboard/sessions` | 会话管理 |
| `GET` | `/api/dashboard/config` | 系统配置 |

## 配置热更新

修改 `backend/config.py` 中的 `settings` 字段 + 调用 `reload_llm()` 清缓存即可生效，无需重启服务。

## License

MIT
