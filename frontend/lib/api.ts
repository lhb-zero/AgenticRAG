// 后端 API 请求封装 - fetch + SSE + 错误处理

import type {
  ChatRequest,
  ReviewRequest,
  ReviewResponse,
  HistoryResponse,
  SSEEvent,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── 通用 fetch 封装 ──

async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({
      detail: res.statusText,
    }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }

  return res.json();
}

// ── POST /api/chat (SSE 流式) ──

export async function sendChatMessage(
  request: ChatRequest,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void
): Promise<void> {
  try {
    const url = `${API_BASE}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 解析 SSE 事件
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(data);
          } catch {
            // skip parse error
          }
        }
      }
    }

    onComplete();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ── POST /api/review ──

export async function submitReview(
  request: ReviewRequest
): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>("/api/review", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// ── GET /api/history/{thread_id} ──

export async function getHistory(
  threadId: string
): Promise<HistoryResponse> {
  return apiFetch<HistoryResponse>(`/api/history/${threadId}`);
}

// ── POST /api/index/build ──

export async function buildIndex(source: "mock" | "uploaded" = "mock") {
  return apiFetch<{ success: boolean; chunk_count: number }>(
    `/api/index/build?source=${source}`,
    { method: "POST" }
  );
}