# Next.js 专项

> React 全栈框架 — App Router / 路由 / 组件 / 数据流

---

## 目录

- [1. App Router 概述](#1-app-router-概述)
- [2. 文件系统路由](#2-文件系统路由)
- [3. 服务端 vs 客户端组件](#3-服务端-vs-客户端组件)
- [4. 数据获取模式](#4-数据获取模式)
- [5. 组件拆分策略](#5-组件拆分策略)
- [6. TypeScript 类型安全](#6-typescript-类型安全)
- [7. 项目文件索引](#7-项目文件索引)

---

## 1. App Router 概述

Next.js 14 的 App Router 使用 `app/` 目录下的文件系统自动生成路由。

```
frontend/
├── app/
│   ├── layout.tsx          # 根布局（包裹所有页面）
│   ├── page.tsx            # 首页 "/"
│   └── globals.css         # 全局样式
├── components/             # UI 组件
│   ├── ChatMessage.tsx
│   ├── OutlineReview.tsx
│   └── AnswerReview.tsx
└── lib/                    # 业务逻辑
    ├── api.ts              # API 请求封装
    └── types.ts            # TypeScript 类型
```

### 与 Pages Router（Next.js 12）的区别

| | App Router (14+) | Pages Router (12) |
|---|---|---|
| 路由定义 | `app/page.tsx` | `pages/index.tsx` |
| 布局 | `layout.tsx`（嵌套） | `_app.tsx`（全局） |
| 数据获取 | Server Components | `getServerSideProps` |
| 流式渲染 | 原生支持 | 不支持 |

---

## 2. 文件系统路由

### 2.1 约定文件

| 文件 | 作用 |
|------|------|
| `layout.tsx` | 布局组件，包裹子页面 |
| `page.tsx` | 页面组件 |
| `loading.tsx` | 加载态 UI |
| `error.tsx` | 错误边界 |
| `not-found.tsx` | 404 页面 |

### 2.2 本项目的路由结构

```
app/
├── layout.tsx     → 全局布局 <html lang="zh-CN">
├── page.tsx       → 首页 "/"（聊天界面）
└── globals.css    → 全局样式
```

由于是单页应用，只需要一个路由。

### 2.3 layout.tsx 详解

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agentic RAG - 企业知识库问答系统",
  description: "具备自我纠错检索和多节点人机交互能力",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>   {/* page.tsx 渲染在这里 */}
    </html>
  );
}
```

**关键点**：
- `metadata` 导出自动生成 `<title>` 和 SEO 标签
- `layout.tsx` 是服务端组件（默认），不包含 `"use client"`

---

## 3. 服务端 vs 客户端组件

### 3.1 核心区别

| | 服务端组件（默认） | 客户端组件（`"use client"`） |
|---|---|---|
| 渲染位置 | 服务端 | 浏览器 |
| 交互能力 | 无（无事件处理） | 有（onClick/useState/useEffect） |
| 访问后端 | 直接（数据库/文件系统） | 通过 API |
| JS 体积 | 零（不发送到客户端） | 包含在 bundle 中 |

### 3.2 本项目的分工

```tsx
// layout.tsx — 服务端组件（纯结构，无交互）
export default function RootLayout({ children }) { ... }

// page.tsx — 客户端组件（状态/Hooks/事件）
"use client";
import { useState } from "react";
export default function Home() { ... }

// ChatMessage.tsx — 客户端组件（但纯展示，可标记 client）
"use client";
export default function ChatMessage({ message }) { ... }

// OutlineReview.tsx — 客户端组件（表单交互）
"use client";
export default function OutlineReview({ onApprove, ... }) { ... }
```

### 3.3 "use client" 的边界规则

```
服务端组件中：
  ✅ 可以渲染客户端组件（作为子组件）
  ❌ 不能使用 useState / useEffect / onClick

客户端组件中：
  ✅ 可以使用所有 React Hooks
  ✅ 可以渲染服务端组件（但会被转为客户端）
  ❌ 不能使用 async/await 直接获取数据
```

### 3.4 最佳实践

- **尽可能保持服务端组件**：layout 用服务端，叶子交互组件用客户端
- **客户端组件尽量小**：把交互逻辑隔离在最小的组件中
- **不要滥用 "use client"**：只在需要交互的文件顶部添加

---

## 4. 数据获取模式

### 4.1 本项目的数据流

```
page.tsx (客户端)
    │
    ├── sendChatMessage()    → POST /api/chat    → SSE 流式
    ├── submitReview()       → POST /api/review   → JSON
    └── getHistory()         → GET /api/history   → JSON
```

### 4.2 API 调用封装

```typescript
// lib/api.ts

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 通用 fetch 封装
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  return res.json();
}
```

### 4.3 SSE 流式消费

```typescript
export async function sendChatMessage(
  request: ChatRequest,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        onEvent(JSON.parse(line.slice(6)));
      }
    }
  }
  onComplete();
}
```

**关键细节**：`buffer` 变量处理 TCP 分片——一行 SSE 数据可能被分成两个 TCP chunk 到达。

---

## 5. 组件拆分策略

### 5.1 按功能拆分

```
components/
├── ChatMessage.tsx     → 单条消息渲染（Markdown）
├── OutlineReview.tsx   → 大纲审核（HITL #1）
└── AnswerReview.tsx    → 答案审核（HITL #2）
```

### 5.2 组件通信模式

```tsx
// 父组件 (page.tsx) → 子组件 (OutlineReview)
<OutlineReview
  outline={outlineText}           // 数据流入（props）
  onApprove={handleApprove}       // 事件流回（callback）
  onEdit={handleEdit}
  onReject={handleReject}
  disabled={isLoading}
/>

// 子组件
interface Props {
  outline: string;                   // 数据
  onApprove: () => void;             // 回调
  onEdit: (text: string) => void;    // 带参数的回调
  onReject: () => void;
  disabled?: boolean;
}
```

### 5.3 状态管理模式

```
page.tsx （唯一状态持有者）
  ├── messages: ChatMessageType[]
  ├── phase: AppPhase
  ├── outline: string
  ├── draftAnswer: string
  └── isLoading: boolean

  状态通过 props 下传，事件通过 callbacks 上传
  （无全局状态管理库，简单场景不需要 Redux/Zustand）
```

---

## 6. TypeScript 类型安全

### 6.1 类型定义

```typescript
// lib/types.ts

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  outline?: string;
  draft_answer?: string;
  node_status?: string;
}

export type AppPhase =
  | "idle"
  | "researching"
  | "outline_review"
  | "generating"
  | "answer_review"
  | "done"
  | "error";
```

### 6.2 与后端类型对齐

后端的 `RetrievalState` 与前端 `SSEEvent` 接口有相同的字段名，避免字段名不一致导致的 bug。

---

## 7. 项目文件索引

| 文件 | 内容 |
|------|------|
| [app/layout.tsx](../frontend/app/layout.tsx) | 根布局，metadata，字体 |
| [app/page.tsx](../frontend/app/page.tsx) | 主聊天页面（全部核心逻辑） |
| [app/globals.css](../frontend/app/globals.css) | Tailwind 指令 + 自定义样式 |
| [components/ChatMessage.tsx](../frontend/components/ChatMessage.tsx) | 消息渲染（react-markdown） |
| [components/OutlineReview.tsx](../frontend/components/OutlineReview.tsx) | 大纲审核面板 |
| [components/AnswerReview.tsx](../frontend/components/AnswerReview.tsx) | 答案审核面板 |
| [lib/api.ts](../frontend/lib/api.ts) | fetch + SSE 封装 |
| [lib/types.ts](../frontend/lib/types.ts) | TypeScript 类型定义 |

## 延伸资源

- [Next.js App Router 文档](https://nextjs.org/docs/app)
- [Server Components 深入](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [React Markdown](https://github.com/remarkjs/react-markdown)