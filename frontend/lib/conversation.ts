/**
 * 会话存储管理器 — localStorage 持久化
 *
 * 每个会话包含: id(UUID), title(首条消息前30字), messages, createdAt, updatedAt
 */

import { ChatMessage } from "./types";

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "agentic_rag_conversations";

// ── 读取全部会话 ──
export function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

// ── 保存全部会话 ──
function saveAll(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

// ── 根据 id 获取单个会话 ──
export function getConversation(id: string): Conversation | null {
  return loadConversations().find((c) => c.id === id) ?? null;
}

// ── 创建新会话 ──
export function createConversation(id: string): Conversation {
  const conv: Conversation = {
    id,
    title: "新对话",
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = loadConversations();
  all.unshift(conv);
  saveAll(all);
  return conv;
}

// ── 更新会话（消息或标题） ──
export function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "messages">>
) {
  const all = loadConversations();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;
  if (patch.title !== undefined) all[idx].title = patch.title;
  if (patch.messages !== undefined) all[idx].messages = patch.messages;
  all[idx].updatedAt = Date.now();
  saveAll(all);
}

// ── 删除会话 ──
export function deleteConversation(id: string) {
  const all = loadConversations().filter((c) => c.id !== id);
  saveAll(all);
}

// ── 从首条用户消息生成标题 ──
export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "新对话";
  const text = first.content.replace(/\n/g, " ").trim();
  return text.length > 30 ? text.slice(0, 30) + "…" : text;
}
