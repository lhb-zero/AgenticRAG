# FastAPI 专项

> 异步 Web 框架 — API 端点 / SSE 流式 / CORS / 生命周期

---

## 目录

- [1. 应用初始化](#1-应用初始化)
- [2. 路由组织](#2-路由组织)
- [3. 请求与响应模型](#3-请求与响应模型)
- [4. SSE 流式响应](#4-sse-流式响应)
- [5. CORS 中间件](#5-cors-中间件)
- [6. 生命周期管理](#6-生命周期管理)
- [7. 异步与同步桥接](#7-异步与同步桥接)
- [8. 错误处理](#8-错误处理)
- [9. 项目文件索引](#9-项目文件索引)

---

## 1. 应用初始化

```python
# main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Agentic RAG with HITL",
    description="企业级 Agentic RAG 知识库系统",
    version="1.0.0",
    lifespan=lifespan,  # 启动/关闭钩子
)

# 注册中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chat_router)
app.include_router(hitl_router)
app.include_router(index_router)
```

### 启动命令

```bash
# 开发模式（热重载）
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 或使用 main.py 中的 __main__ 块
python main.py
```

---

## 2. 路由组织

### 2.1 模块化拆分

```
api/
├── __init__.py
├── chat.py      # APIRouter(prefix="/api", tags=["chat"])
├── hitl.py      # APIRouter(prefix="/api", tags=["hitl"])
└── index.py     # APIRouter(prefix="/api/index", tags=["index"])
```

### 2.2 路由定义

```python
# api/chat.py
from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["chat"])

@router.post("/chat")
async def chat(request: ChatRequest):
    ...
```

### 2.3 本项目 API 总览

| 方法 | 路径 | 功能 | 文件 |
|------|------|------|------|
| POST | `/api/chat` | 发送消息，SSE 流式返回 | [chat.py](../backend/api/chat.py) |
| POST | `/api/review` | 提交 HITL 审核结果 | [hitl.py](../backend/api/hitl.py) |
| GET | `/api/history/{thread_id}` | 获取会话状态 | [hitl.py](../backend/api/hitl.py) |
| POST | `/api/index/build` | 触发索引构建 | [index.py](../backend/api/index.py) |
| POST | `/api/index/upload` | 上传文档文件 | [index.py](../backend/api/index.py) |
| GET | `/health` | 健康检查 | [main.py](../backend/main.py) |

---

## 3. 请求与响应模型

### 3.1 请求模型（Pydantic BaseModel）

```python
from pydantic import BaseModel

class ChatRequest(BaseModel):
    query: str
    thread_id: str

class ReviewRequest(BaseModel):
    thread_id: str
    stage: str        # "outline" | "answer"
    decision: str     # "approve" | "reject" | "edit"
    feedback: str = ""  # 可选字段，有默认值
```

FastAPI 自动完成：
- **校验**：字段类型 / 必填检查
- **文档**：生成 OpenAPI (Swagger) 文档
- **序列化**：JSON → Python 对象

### 3.2 响应模型

```python
class ReviewResponse(BaseModel):
    success: bool
    node_status: str
    message: str
    data: dict = {}

@router.post("/review", response_model=ReviewResponse)
async def submit_review(request: ReviewRequest):
    return ReviewResponse(success=True, ...)
```

### 3.3 文件上传

```python
from fastapi import UploadFile, File

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    # file.filename — 原始文件名
    # file.file      — 类文件对象（可读）
    content = await file.read()
    with open(f"data/raw/{file.filename}", "wb") as f:
        f.write(content)
    return {"success": True, "filename": file.filename}
```

---

## 4. SSE 流式响应

### 4.1 核心：StreamingResponse

```python
from fastapi.responses import StreamingResponse

async def event_generator():
    yield "event: status\ndata: {\"message\": \"开始\"}\n\n"
    yield "event: done\ndata: {\"result\": \"完成\"}\n\n"

@router.post("/chat")
async def chat(request: ChatRequest):
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 nginx 代理缓冲
        },
    )
```

### 4.2 SSE 消息格式规范

```
event: <事件类型>\n
data: <JSON 数据>\n
\n
```

- 每条消息以 `\n\n` 结尾（空行分隔）
- `event:` 指定事件类型，前端通过 `addEventListener` 监听
- `data:` 承载 JSON 载荷

### 4.3 本项目的事件类型

| 事件 | 触发时机 | data 关键字段 |
|------|----------|--------------|
| `status` | 各阶段状态更新 | `node_status`, `message` |
| `outline` | 大纲生成完毕，等待审核 | `outline`, `node_status: "outline_review"` |
| `draft` | 草稿生成完毕，等待审核 | `draft_answer`, `node_status: "answer_review"` |
| `done` | 最终答案确认 | `final_answer`, `node_status: "done"` |
| `error` | 执行异常 | `error`, `node_status: "error"` |

### 4.4 前端消费

```typescript
// 详见 docs/sse.md
const res = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ query, thread_id }),
});

const reader = res.body?.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 解析 SSE 格式，提取 event + data
}
```

---

## 5. CORS 中间件

### 5.1 为什么需要

前端 `http://localhost:3000` 向后端 `http://localhost:8000` 发请求属于跨域，浏览器默认阻止。

### 5.2 配置

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 允许的来源
    allow_credentials=True,                    # 允许携带 Cookie
    allow_methods=["*"],                       # 允许所有 HTTP 方法
    allow_headers=["*"],                       # 允许所有请求头
)
```

### 5.3 生产环境注意

`allow_origins=["*"]` 有安全风险，生产环境应配置具体域名。

---

## 6. 生命周期管理

### 6.1 lifespan 上下文管理器

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # === 启动时执行 ===
    print("[Main] 应用启动中...")
    from graph.index_graph import init_index_on_startup
    init_index_on_startup()  # 自动构建向量库索引

    yield  # ← 应用运行期间

    # === 关闭时执行 ===
    print("[Main] 应用关闭中...")
    # 清理资源：关闭数据库连接、释放文件句柄等

app = FastAPI(lifespan=lifespan)
```

### 6.2 本项目启动时做的事

1. 检查 `data/vectorstore/index.faiss` 是否存在
2. 不存在 → 用 6 篇 Mock 文档自动构建索引
3. 存在 → 跳过构建，直接使用已有索引

---

## 7. 异步与同步桥接

### 7.1 问题

LangGraph 的 `graph.invoke()` 是同步方法，但 FastAPI 端点定义为 `async def`。

### 7.2 解决方案：run_in_executor

```python
import asyncio

@router.post("/chat")
async def chat(request: ChatRequest):
    loop = asyncio.get_event_loop()

    # 在线程池中运行同步代码，不阻塞事件循环
    result = await loop.run_in_executor(
        None,  # 使用默认线程池
        lambda: graph.invoke(initial_state, config)
    )

    return result
```

### 7.3 为什么不用 `async def` 节点

LangGraph 节点默认是同步的。新版本 LangGraph 支持异步节点（`async def`），但当前项目为兼容性使用同步节点 + `run_in_executor` 桥接。

---

## 8. 错误处理

### 8.1 HTTPException

```python
from fastapi import HTTPException

@router.post("/chat")
async def chat(request: ChatRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="查询不能为空")
    ...
```

### 8.2 全局异常处理

```python
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": f"服务器内部错误: {str(exc)}"},
    )
```

---

## 9. 项目文件索引

| 文件 | 内容 |
|------|------|
| [main.py](../backend/main.py) | 应用初始化 / CORS / 路由注册 / lifespan |
| [api/chat.py](../backend/api/chat.py) | POST /api/chat — SSE 流式 |
| [api/hitl.py](../backend/api/hitl.py) | POST /api/review + GET /api/history |
| [api/index.py](../backend/api/index.py) | POST /api/index/build + upload |

## 延伸资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/zh/)
- [SSE 协议规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [FastAPI StreamingResponse](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)