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
            onEvent({ _event: currentEvent, ...data });
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

// ── POST /api/test-graph ──

export async function testGraph(request: ChatRequest): Promise<{
  all_ok: boolean;
  results: Record<string, { ok: boolean; error?: string; [key: string]: any }>;
}> {
  return apiFetch("/api/test-graph", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

// ── Dashboard API ──

export interface DashboardStats {
  vectorstore: {
    total_chunks: number;
    unique_documents: number;
    documents: { title: string; chunks: number }[];
    error?: string;
  };
  index_files: {
    faiss_size_kb: number;
    pkl_size_kb: number;
  };
  sessions: {
    total: number;
    active: number;
  };
  config: {
    llm_model: string;
    embedding_provider: string;
    embedding_model: string;
    chunk_size: number;
    chunk_overlap: number;
    top_k: number;
    max_rewrite_attempts: number;
  };
}

export interface DocInfo {
  title: string;
  source: string;
  chunks: number;
  sample: string;
}

export interface SessionInfo {
  thread_id: string;
  has_interrupt: boolean;
  node_status: string;
  query?: string;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/api/dashboard/stats");
}

export async function getDashboardDocuments(): Promise<{
  documents: DocInfo[];
  total_chunks: number;
}> {
  return apiFetch("/api/dashboard/documents");
}

export async function getDocumentChunks(title: string): Promise<{
  title: string;
  chunks: { content: string; metadata: Record<string, string>; length: number }[];
  total: number;
}> {
  return apiFetch(`/api/dashboard/documents/chunks?title=${encodeURIComponent(title)}`);
}

export async function deleteDashboardDocument(
  title: string
): Promise<{ success: boolean; deleted_chunks: number }> {
  return apiFetch(`/api/dashboard/documents?title=${encodeURIComponent(title)}`, {
    method: "DELETE",
  });
}

export interface ModelPreset {
  id: string;
  name: string;
  desc: string;
}

export interface ConfigResponse {
  models: ModelPreset[];
  current_model: string;
  params: {
    deepseek_temperature: number;
    deepseek_max_tokens: number;
    chunk_size: number;
    chunk_overlap: number;
    top_k_retrieval: number;
    max_rewrite_attempts: number;
    max_search_queries: number;
  };
}

export async function getDashboardConfig(): Promise<ConfigResponse> {
  return apiFetch("/api/dashboard/config");
}

export async function switchModel(model: string): Promise<{ success: boolean; message: string }> {
  return apiFetch("/api/dashboard/config/model", {
    method: "PUT",
    body: JSON.stringify({ model }),
  });
}

export async function updateParams(update: Record<string, number>): Promise<{
  success: boolean;
  message: string;
}> {
  return apiFetch("/api/dashboard/config/params", {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

export async function testCurrentModel(): Promise<{
  success: boolean;
  model?: string;
  elapsed_s?: number;
  response?: string;
  error?: string;
}> {
  return apiFetch("/api/dashboard/config/test", { method: "POST" });
}

export async function getDashboardSessions(): Promise<{
  sessions: SessionInfo[];
  total: number;
}> {
  return apiFetch("/api/dashboard/sessions");
}

export async function deleteDashboardSession(
  threadId: string
): Promise<{ success: boolean }> {
  return apiFetch(`/api/dashboard/sessions/${threadId}`, {
    method: "DELETE",
  });
}

export async function getDashboardTrace(threadId: string): Promise<{
  thread_id: string;
  current_status: string;
  query: string;
  research_plan: string[];
  retrieved_docs: any[];
  doc_grades: any[];
  outline: string;
  draft_answer: string;
  final_answer: string;
  hallucination_check: any;
  has_interrupt: boolean;
  history: any[];
}> {
  return apiFetch(`/api/dashboard/trace/${threadId}`);
}

export async function uploadDocument(
  file: File
): Promise<{ success: boolean; filename: string }> {
  const url = `${API_BASE}/api/index/upload`;
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(url, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}