# SSE 专项

> Server-Sent Events — 服务端向客户端实时推送数据

---

## 目录

- [1. 基本概念](#1-基本概念)
- [2. SSE vs WebSocket vs 轮询](#2-sse-vs-websocket-vs-轮询)
- [3. 消息格式规范](#3-消息格式规范)
- [4. 后端实现（FastAPI）](#4-后端实现fastapi)
- [5. 前端消费（fetch + ReadableStream）](#5-前端消费fetch--readablestream)
- [6. TCP 分片处理](#6-tcp-分片处理)
- [7. 本项目的 SSE 事件设计](#7-本项目的-sse-事件设计)
- [8. 常见问题](#8-常见问题)

---

## 1. 基本概念

SSE 是一种基于 HTTP 的**单向推送**协议。客户端发起一个 HTTP 连接后，服务端可以持续向客户端发送数据，客户端**不能**通过同一连接向服务端发数据。

```
客户端                         服务端
  │                              │
  │──── GET /api/chat ───────────→│  (建立连接)
  │                              │
  │←── event: status ────────────│  (推送 1)
  │←── event: outline ───────────│  (推送 2)
  │←── event: draft ─────────────│  (推送 3)
  │←── event: done ──────────────│  (推送 4)
  │                              │
  │──── 连接自动关闭 ─────────────│
```

### 为什么本项目用 SSE 而不是 WebSocket

| 需求 | SSE | WebSocket |
|------|-----|-----------|
| 服务端 → 客户端推送 | 原生支持 | 原生支持 |
| 客户端 → 服务端发消息 | 需要另一个 HTTP 请求 | 同一连接 |
| 自动重连 | 浏览器内置 | 需手动实现 |
| 实现复杂度 | 极简 | 较复杂 |

本项目的模式是：客户端发一次请求 → 服务端推送多次事件 → 结束。SSE 完美契合这种"一次请求，多次响应"的模式。

---

## 2. SSE vs WebSocket vs 轮询

| | SSE | WebSocket | 短轮询 (Polling) |
|---|---|---|---|
| 协议 | HTTP/1.1 或 HTTP/2 | WS/WSS | HTTP |
| 方向 | 单向（S→C） | 双向 | 双向 |
| 连接 | 长连接 | 长连接 | 短连接 |
| 开销 | 低（HTTP 流） | 低 | 高（每秒一个请求） |
| 浏览器支持 | 所有现代浏览器 | 所有现代浏览器 | 所有浏览器 |
| 穿透代理 | 天然支持 | 可能被阻断 | 天然支持 |
| CORS | 需要配置 | 不需要 | 需要配置 |
| 重连 | 自动（内置） | 手动 | N/A |

---

## 3. 消息格式规范

### 3.1 基本格式

```
[field]: [value]\n
\n
```

支持的字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `data` | 数据载荷（JSON） | `data: {"msg": "hello"}` |
| `event` | 事件类型 | `event: outline` |
| `id` | 事件 ID（用于断线重连） | `id: 42` |
| `retry` | 重连间隔（毫秒） | `retry: 3000` |

### 3.2 多行 data

```
data: 第一行
data: 第二行
\n
```
等效于 `data: 第一行\n第二行`。

### 3.3 本项目的消息格式

```
event: status\ndata: {"node_status":"researching","message":"正在检索..."}\n\n
```

每个消息三部分：
1. `event:` 行 — 事件类型名
2. `data:` 行 — JSON 载荷（单行）
3. `\n\n` — 消息结束标记

---

## 4. 后端实现（FastAPI）

### 4.1 StreamingResponse

```python
from fastapi.responses import StreamingResponse

async def event_generator():
    """生成器函数，yield SSE 格式字符串"""
    yield "event: status\ndata: {\"node_status\":\"researching\"}\n\n"
    await asyncio.sleep(1)
    yield "event: done\ndata: {\"result\":\"完成\"}\n\n"

@router.post("/chat")
async def chat():
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",    # MIME 类型
        headers={
            "Cache-Control": "no-cache",   # 禁用缓存
            "Connection": "keep-alive",    # 保持连接
            "X-Accel-Buffering": "no",     # 禁用 nginx 代理缓冲
        },
    )
```

### 4.2 三个关键 Header

| Header | 作用 | 不设置会发生什么 |
|--------|------|-----------------|
| `Cache-Control: no-cache` | 禁止浏览器/代理缓存 | 可能收到旧数据 |
| `Connection: keep-alive` | 保持 HTTP 连接 | 每次推送重新握手 |
| `X-Accel-Buffering: no` | 禁用 nginx 缓冲 | nginx 会缓冲数据，延迟推送 |

### 4.3 生成器函数的最佳实践

```python
async def event_generator():
    try:
        # 正常推送
        yield format_event("status", {...})
        yield format_event("done", {...})
    except Exception as e:
        # 异常时也要发送 error 事件
        yield format_event("error", {"error": str(e)})
    # 生成器结束 = 连接关闭
```

---

## 5. 前端消费（fetch + ReadableStream）

### 5.1 核心实现

```typescript
async function consumeSSE(url: string, onEvent: (data: any) => void) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "...", thread_id: "..." }),
  });

  // 获取可读流
  const reader = res.body?.getReader();
  if (!reader) throw new Error("不支持流式响应");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // value 是 Uint8Array，解码为字符串
    buffer += decoder.decode(value, { stream: true });

    // 按行分割，解析 SSE 消息
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";  // 保留不完整的最后一行

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        onEvent(data);
      }
    }
  }
}
```

### 5.2 为什么用 fetch 而非 EventSource

| | `fetch` + `ReadableStream` | `EventSource` |
|---|---|---|
| 请求方法 | 支持 POST | 仅 GET |
| 自定义 Header | 支持 | 不支持 |
| 请求体 | 支持 | 不支持 |
| 自动重连 | 需手动实现 | 内置 |
| 错误恢复 | 需手动实现 | 内置 |

本项目需要 POST 请求传 JSON body，所以必须用 fetch。

---

## 6. TCP 分片处理

### 6.1 问题

TCP 是流式协议，一条 SSE 消息可能被分成多个 TCP 包到达：

```
服务端发送: "event: done\ndata: {"result":"ok"}\n\n"

网络传输:
  包 1: "event: done\ndata: {\"res"    ← 不完整
  包 2: "ult\":\"ok\"}\n\n"            ← 剩余部分
```

### 6.2 解决方案：buffer 缓存

```typescript
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  const lines = buffer.split("\n");
  buffer = lines.pop() || "";  // ← 关键：保留最后不完整的行

  for (const line of lines) {
    // 处理完整的行
  }
}
```

**核心逻辑**：
1. 新数据追加到 buffer
2. 按 `\n` 切分
3. `pop()` 取走最后一段（可能不完整），留在 buffer 中
4. 下次循环时与新数据拼接

---

## 7. 本项目的 SSE 事件设计

### 7.1 事件类型

| 事件 | 触发节点 | data 字段 | 前端行为 |
|------|----------|-----------|----------|
| `status` | 各节点 | `node_status`, `message` | 更新状态文本 |
| `outline` | generate_outline 前挂起 | `outline`, `node_status: "outline_review"` | 渲染 OutlineReview 组件 |
| `draft` | generate_draft 前挂起 | `draft_answer`, `node_status: "answer_review"` | 渲染 AnswerReview 组件 |
| `done` | finalize 后 | `final_answer`, `node_status: "done"` | 显示最终答案 |
| `error` | 异常时 | `error`, `node_status: "error"` | 显示错误信息 |

### 7.2 辅助类封装

```python
# chat.py
class ChatEvent:
    def __init__(self, event: str, data: dict):
        self.event = event
        self.data = data

    def to_sse(self) -> str:
        return f"event: {self.event}\ndata: {json.dumps(self.data, ensure_ascii=False)}\n\n"

# 使用
yield ChatEvent("outline", {
    "outline": result.get("outline"),
    "node_status": "outline_review",
}).to_sse()
```

---

## 8. 常见问题

### Q1: 连接中断后如何恢复？

浏览器的 `EventSource` API 会自动重连。使用 fetch 方案需要手动实现：

```typescript
// 简单的指数退避重连
let retryDelay = 1000;
while (true) {
  try {
    await consumeSSE(url, onEvent);
    break;  // 成功完成
  } catch (e) {
    await sleep(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  }
}
```

### Q2: nginx 代理下 SSE 不工作？

在 nginx 配置中添加：

```nginx
location /api/chat {
    proxy_pass http://backend:8000;
    proxy_buffering off;           # 关键：关闭缓冲
    proxy_cache off;
    proxy_read_timeout 600s;       # 延长超时
}
```

或者在应用层添加 `X-Accel-Buffering: no` header（本项目已添加）。

### Q3: 多个 SSE 连接是否互相影响？

不影响。每个 SSE 连接是独立的 HTTP 请求，服务端通过 `thread_id` 区分会话。

### Q4: SSE 可以传送二进制数据吗？

SSE 仅支持 UTF-8 文本。二进制数据应 base64 编码后放入 JSON。

---

## 项目文件索引

| 文件 | 内容 |
|------|------|
| [api/chat.py](../backend/api/chat.py) | SSE 事件生成 + StreamingResponse |
| [lib/api.ts](../frontend/lib/api.ts) | fetch + ReadableStream SSE 消费 |

## 延伸资源

- [SSE 协议规范 (WHATWG)](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN: Server-Sent Events](https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events)
- [FastAPI StreamingResponse](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)