/**
 * 会话存储管理器 — localStorage 持久化
 * 支持分组：会话可归入某个 Group，也可不属于任何分组（未分组）
 */

import { ChatMessage } from "./types";

// ── 类型 ──

export interface Conversation {
  id: string;
  title: string;
  groupId: string | null; // null = 未分组
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  createdAt: number;
}

// ── Storage Keys ──

const CONV_KEY = "agentic_rag_conversations";
const GROUP_KEY = "agentic_rag_groups";

// ── 底层读写 ──

function readRaw<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRaw<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ═══════════════════════════════════════════
// 会话 CRUD
// ═══════════════════════════════════════════

export function loadConversations(): Conversation[] {
  return readRaw<Conversation>(CONV_KEY);
}

function saveAllConversations(conversations: Conversation[]) {
  writeRaw(CONV_KEY, conversations);
}

export function getConversation(id: string): Conversation | null {
  return loadConversations().find((c) => c.id === id) ?? null;
}

export function createConversation(id: string): Conversation {
  const conv: Conversation = {
    id,
    title: "新对话",
    groupId: null,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = loadConversations();
  all.unshift(conv);
  saveAllConversations(all);
  return conv;
}

export function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, "title" | "messages" | "groupId">>
) {
  const all = loadConversations();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;
  if (patch.title !== undefined) all[idx].title = patch.title;
  if (patch.messages !== undefined) all[idx].messages = patch.messages;
  if (patch.groupId !== undefined) all[idx].groupId = patch.groupId;
  all[idx].updatedAt = Date.now();
  saveAllConversations(all);
}

export function deleteConversation(id: string) {
  saveAllConversations(loadConversations().filter((c) => c.id !== id));
}

export function deriveTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "新对话";
  const text = first.content.replace(/\n/g, " ").trim();
  return text.length > 30 ? text.slice(0, 30) + "…" : text;
}

// ═══════════════════════════════════════════
// 分组 CRUD
// ═══════════════════════════════════════════

export function loadGroups(): Group[] {
  return readRaw<Group>(GROUP_KEY);
}

function saveAllGroups(groups: Group[]) {
  writeRaw(GROUP_KEY, groups);
}

export function createGroup(name: string): Group {
  const group: Group = {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
  };
  const all = loadGroups();
  all.push(group);
  saveAllGroups(all);
  return group;
}

export function renameGroup(id: string, newName: string) {
  const all = loadGroups();
  const idx = all.findIndex((g) => g.id === id);
  if (idx === -1) return;
  all[idx].name = newName;
  saveAllGroups(all);
}

export function deleteGroup(id: string) {
  // 删除分组时，把该分组下的会话退回未分组
  const convs = loadConversations();
  convs.forEach((c) => {
    if (c.groupId === id) c.groupId = null;
  });
  saveAllConversations(convs);
  saveAllGroups(loadGroups().filter((g) => g.id !== id));
}

export function moveConversationToGroup(convId: string, groupId: string | null) {
  updateConversation(convId, { groupId });
}
