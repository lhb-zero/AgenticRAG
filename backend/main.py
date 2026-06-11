"""FastAPI 应用入口 - 初始化、CORS、路由注册、启动生命周期"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时: 初始化索引
    print("[Main] 应用启动中...")
    from graph.index_graph import init_index_on_startup
    init_index_on_startup()
    print(f"[Main] 服务就绪: http://{settings.host}:{settings.port}")

    yield

    # 关闭时: 清理资源
    print("[Main] 应用关闭中...")


app = FastAPI(
    title="Agentic RAG with HITL",
    description="企业级 Agentic RAG 知识库系统，具备自我纠错检索和多节点人机交互能力",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS 中间件 ──
# allow_origins=["*"] 与 allow_credentials=True 不能共存
# 本项目无需 cookie/auth header，关闭 credentials 以最大化兼容性
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 注册路由 ──
from api.chat import router as chat_router
from api.hitl import router as hitl_router
from api.index import router as index_router
from api.dashboard import router as dashboard_router

app.include_router(chat_router)
app.include_router(hitl_router)
app.include_router(index_router)
app.include_router(dashboard_router)


# ── 健康检查 ──
@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )