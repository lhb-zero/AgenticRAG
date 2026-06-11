// TypeScript 类型定义 - 与后端 State/API 契约对齐

// ── API 请求/响应 ──

export interface ChatRequest {
  query: string;
  thread_id: string;
}

export interface ReviewRequest {
  thread_id: string;
  stage: "outline" | "answer";
  decision: "approve" | "reject" | "edit";
  feedback?: string;
}

export interface ReviewResponse {
  success: boolean;
  node_status: string;
  message: string;
  data: {
    outline?: string;
    draft_answer?: string;
    final_answer?: string;
    message?: string;
  };
}

export interface HistoryResponse {
  thread_id: string;
  exists: boolean;
  node_status: string;
  has_interrupt: boolean;
  interrupts: string[];
  outline: string;
  draft_answer: string;
  final_answer: string;
  outline_approved: boolean;
  answer_approved: boolean;
  research_plan: string[];
  retrieved_docs: DocResult[];
  doc_grades: DocGrade[];
  hallucination_check: HallucinationCheck;
  error: string;
}

// ── SSE 事件 ──

export type SSEEventType = "status" | "token" | "outline" | "draft" | "done" | "error";

export interface SSEEvent {
  _event?: string;        // SSE 事件类型 (status/token/outline/draft/done/error)
  node_status: string;
  message?: string;
  content?: string;       // token 级内容片段
  node?: string;          // 当前产生 token 的节点名
  outline?: string;
  draft_answer?: string;
  final_answer?: string;
  hallucination_check?: HallucinationCheck;
  error?: string;
}

// ── 文档相关 ──

export interface DocResult {
  content: string;
  metadata: Record<string, string>;
  score: number | null;
}

export interface DocGrade {
  index: number;
  grade: "relevant" | "irrelevant" | "partial";
  reason: string;
}

export interface HallucinationCheck {
  grade: "faithful" | "hallucinated" | "unknown";
  reason?: string;
  hallucinated_parts?: string[];
}

// ── 消息类型 ──

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  // HITL 相关
  outline?: string;
  draft_answer?: string;
  node_status?: string;
  // 流式状态
  isStreaming?: boolean;
  // 幻觉检测
  hallucination_check?: HallucinationCheck;
}

// ── 应用阶段 ──

export type AppPhase =
  | "idle"
  | "researching"
  | "outline_review"
  | "generating"
  | "answer_review"
  | "done"
  | "error";