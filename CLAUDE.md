# CLAUDE.md — Agentic RAG 项目

## 项目简介
企业级知识库问答系统，具备自我纠错检索和 HITL（人机交互）能力。

## 技术栈
- **后端**: Python 3.11+ / FastAPI / LangGraph / FAISS
- **前端**: Next.js 14 / Tailwind CSS / React Markdown
- **LLM**: DeepSeek (deepseek-v4-flash/pro)
- **Embedding**: 本地 Ollama bge-m3

## 启动方式
```bash
cd backend && python main.py
cd frontend && npm run dev
```

## 关键约定
- API Key 在 `backend/.env` 配置，不暴露到前端
- 配置热更新：修改 `settings` 字段 + `reload_llm()` 清缓存，不重启
- SSE 流式用 `graph.astream_events(version="v2")`，不是 `graph.invoke()`

## 详细上下文
需要了解完整进度、文件索引、设计决策、待办事项时，读 `docs/PROJECT_CONTEXT.md`。
