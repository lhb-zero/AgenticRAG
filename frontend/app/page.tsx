// 主聊天页面 — 三栏布局：侧边栏 + 对话区 + 输入区

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage as ChatMessageType, AppPhase, SSEEvent } from "@/lib/types";
import { sendChatMessage, submitReview } from "@/lib/api";
import {
  loadConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  deriveTitle,
  type Conversation,
} from "@/lib/conversation";

import ChatMessage from "@/components/ChatMessage";
import OutlineReview from "@/components/OutlineReview";
import AnswerReview from "@/components/AnswerReview";
import Sidebar from "@/components/Sidebar";
import WelcomeScreen from "@/components/WelcomeScreen";
import ChatInput from "@/components/ChatInput";
import StatusBadge from "@/components/StatusBadge";

export default function Home() {
  // ── 会话管理 ──
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── 当前对话状态 ──
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [threadId, setThreadId] = useState<string>("");
  const [outline, setOutline] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingTokensRef = useRef<string[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastAssistantIdRef = useRef<string | null>(null);

  // ── 初始化：加载会话列表 ──
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

  // ── 持久化当前对话 ──
  const persistMessages = useCallback(
    (msgs: ChatMessageType[]) => {
      if (!activeId) return;
      updateConversation(activeId, { messages: msgs, title: deriveTitle(msgs) });
      setConversations(loadConversations());
    },
    [activeId]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase, scrollToBottom]);

  // ── Token 节流 ──
  const flushTokens = useCallback(() => {
    const tokens = pendingTokensRef.current;
    if (tokens.length === 0) return;
    pendingTokensRef.current = [];
    const text = tokens.join("");
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === "assistant" && updated[lastIdx].isStreaming) {
        updated[lastIdx] = { ...updated[lastIdx], content: updated[lastIdx].content + text };
      }
      return updated;
    });
    rafRef.current = null;
  }, []);

  const addMessage = useCallback(
    (msg: Partial<ChatMessageType> & { role: "user" | "assistant" }) => {
      const newMsg: ChatMessageType = { id: uuidv4(), timestamp: Date.now(), ...msg } as ChatMessageType;
      setMessages((prev) => [...prev, newMsg]);
      return newMsg.id;
    },
    []
  );

  const appendToken = useCallback(
    (token: string) => {
      pendingTokensRef.current.push(token);
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushTokens);
      }
    },
    [flushTokens]
  );

  const finalizeStreaming = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const remaining = pendingTokensRef.current.join("");
      pendingTokensRef.current = [];
      if (remaining) {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
            updated[lastIdx] = { ...updated[lastIdx], content: updated[lastIdx].content + remaining };
          }
          return updated;
        });
      }
    }
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === "assistant" && updated[lastIdx].isStreaming) {
        updated[lastIdx] = { ...updated[lastIdx], isStreaming: false };
      }
      return updated;
    });
  }, []);

  const updateLastAssistant = useCallback((updates: Partial<ChatMessageType>) => {
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
        updated[lastIdx] = { ...updated[lastIdx], ...updates };
      }
      return updated;
    });
  }, []);

  const startStreamingMessage = useCallback(
    (initialContent: string) => {
      const id = addMessage({ role: "assistant", content: initialContent, isStreaming: true });
      lastAssistantIdRef.current = id;
      return id;
    },
    [addMessage]
  );

  // ── 新建对话 ──
  const handleNew = () => {
    const id = uuidv4();
    createConversation(id);
    setConversations(loadConversations());
    setActiveId(id);
    setMessages([]);
    setThreadId(id);
    setPhase("idle");
    setOutline("");
    setDraftAnswer("");
    setIsLoading(false);
    pendingTokensRef.current = [];
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // ── 切换对话 ──
  const handleSelect = (id: string) => {
    const conv = loadConversations().find((c) => c.id === id);
    if (!conv) return;
    setActiveId(id);
    setMessages(conv.messages);
    setThreadId(id);
    setPhase("idle");
    setOutline("");
    setDraftAnswer("");
    setIsLoading(false);
  };

  // ── 删除对话 ──
  const handleDelete = (id: string) => {
    deleteConversation(id);
    setConversations(loadConversations());
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setThreadId("");
      setPhase("idle");
    }
  };

  // ── 重命名对话 ──
  const handleRename = (id: string, newTitle: string) => {
    updateConversation(id, { title: newTitle });
    setConversations(loadConversations());
  };

  // ── 发送消息 ──
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    // 如果没有活跃对话，先创建
    let currentId = activeId;
    if (!currentId) {
      currentId = uuidv4();
      createConversation(currentId);
      setActiveId(currentId);
      setThreadId(currentId);
    }

    const tid = threadId || currentId;
    if (!threadId) setThreadId(tid);

    const userMsg: ChatMessageType = { id: uuidv4(), role: "user", content: trimmed, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setPhase("researching");

    // 持久化用户消息
    updateConversation(currentId!, { messages: newMessages, title: deriveTitle(newMessages) });
    setConversations(loadConversations());

    startStreamingMessage("正在分析问题...");

    sendChatMessage(
      { query: trimmed, thread_id: tid },
      (event: SSEEvent) => {
        const eventType = event._event || event.node_status;

        if (eventType === "token" && event.content) {
          setMessages((prev) => {
            const lastIdx = prev.length - 1;
            if (lastIdx >= 0 && prev[lastIdx].content === "正在分析问题...") {
              const updated = [...prev];
              updated[lastIdx] = { ...updated[lastIdx], content: "" };
              return updated;
            }
            return prev;
          });
          appendToken(event.content);
          return;
        }

        switch (event.node_status) {
          case "chitchat":
            setPhase("done");
            break;
          case "researching":
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].content === "正在分析问题...") {
                const updated = [...prev];
                updated[lastIdx] = { ...updated[lastIdx], content: "正在检索相关知识库文档..." };
                return updated;
              }
              return prev;
            });
            setPhase("researching");
            break;
          case "generating_outline":
            setPhase("researching");
            break;
          case "outline_review":
            finalizeStreaming();
            setOutline(event.outline || "");
            updateLastAssistant({ outline: event.outline, node_status: "outline_review" });
            setPhase("outline_review");
            break;
          case "generating_draft":
            setPhase("generating");
            break;
          case "answer_review":
            finalizeStreaming();
            setDraftAnswer(event.draft_answer || "");
            updateLastAssistant({
              draft_answer: event.draft_answer,
              node_status: "answer_review",
              hallucination_check: event.hallucination_check,
            });
            setPhase("answer_review");
            break;
          case "done":
            finalizeStreaming();
            updateLastAssistant({ content: event.final_answer || "" });
            setPhase("done");
            break;
          case "error":
            finalizeStreaming();
            updateLastAssistant({ content: `错误: ${event.error || "未知错误"}` });
            setPhase("error");
            break;
        }
      },
      (error: Error) => {
        finalizeStreaming();
        updateLastAssistant({ content: `请求失败: ${error.message}` });
        setPhase("error");
        setIsLoading(false);
      },
      () => {
        finalizeStreaming();
        setIsLoading(false);
      }
    );
  };

  // ── 快捷提问（从 WelcomeScreen） ──
  const handleQuickAsk = (question: string) => {
    setInput(question);
    // 利用 setTimeout 等 state 更新后再发送
    setTimeout(() => {
      const trimmed = question.trim();
      if (!trimmed || isLoading) return;

      let currentId = activeId;
      if (!currentId) {
        currentId = uuidv4();
        createConversation(currentId);
        setActiveId(currentId);
        setThreadId(currentId);
      }

      const tid = threadId || currentId;
      if (!threadId) setThreadId(tid);

      const userMsg: ChatMessageType = { id: uuidv4(), role: "user", content: trimmed, timestamp: Date.now() };
      const newMessages = [...messages, userMsg];
      setMessages(newMessages);
      setInput("");
      setIsLoading(true);
      setPhase("researching");

      updateConversation(currentId!, { messages: newMessages, title: deriveTitle(newMessages) });
      setConversations(loadConversations());

      startStreamingMessage("正在分析问题...");

      sendChatMessage(
        { query: trimmed, thread_id: tid },
        (event: SSEEvent) => {
          const eventType = event._event || event.node_status;
          if (eventType === "token" && event.content) {
            setMessages((prev) => {
              const lastIdx = prev.length - 1;
              if (lastIdx >= 0 && prev[lastIdx].content === "正在分析问题...") {
                const updated = [...prev];
                updated[lastIdx] = { ...updated[lastIdx], content: "" };
                return updated;
              }
              return prev;
            });
            appendToken(event.content);
            return;
          }
          switch (event.node_status) {
            case "chitchat":
              setPhase("done");
              break;
            case "researching":
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].content === "正在分析问题...") {
                  const updated = [...prev];
                  updated[lastIdx] = { ...updated[lastIdx], content: "正在检索相关知识库文档..." };
                  return updated;
                }
                return prev;
              });
              setPhase("researching");
              break;
            case "generating_outline":
              setPhase("researching");
              break;
            case "outline_review":
              finalizeStreaming();
              setOutline(event.outline || "");
              updateLastAssistant({ outline: event.outline, node_status: "outline_review" });
              setPhase("outline_review");
              break;
            case "generating_draft":
              setPhase("generating");
              break;
            case "answer_review":
              finalizeStreaming();
              setDraftAnswer(event.draft_answer || "");
              updateLastAssistant({
                draft_answer: event.draft_answer,
                node_status: "answer_review",
                hallucination_check: event.hallucination_check,
              });
              setPhase("answer_review");
              break;
            case "done":
              finalizeStreaming();
              updateLastAssistant({ content: event.final_answer || "" });
              setPhase("done");
              break;
            case "error":
              finalizeStreaming();
              updateLastAssistant({ content: `错误: ${event.error || "未知错误"}` });
              setPhase("error");
              break;
          }
        },
        (error: Error) => {
          finalizeStreaming();
          updateLastAssistant({ content: `请求失败: ${error.message}` });
          setPhase("error");
          setIsLoading(false);
        },
        () => {
          finalizeStreaming();
          setIsLoading(false);
        }
      );
    }, 0);
  };

  // ── 持久化：消息变化时同步到 localStorage ──
  useEffect(() => {
    if (activeId && messages.length > 0) {
      updateConversation(activeId, { messages, title: deriveTitle(messages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ── HITL: 大纲审核 ──
  const handleOutlineApprove = async () => {
    if (!threadId) return;
    setIsLoading(true);
    setPhase("generating");
    try {
      const res = await submitReview({ thread_id: threadId, stage: "outline", decision: "approve" });
      if (res.node_status === "answer_review") {
        setDraftAnswer(res.data.draft_answer || "");
        addMessage({
          role: "assistant",
          content: "答案草稿已生成，请审核确认：",
          draft_answer: res.data.draft_answer,
          node_status: "answer_review",
        });
        setPhase("answer_review");
      } else if (res.node_status === "done") {
        addMessage({ role: "assistant", content: res.data.final_answer || "" });
        setPhase("done");
      }
    } catch (err) {
      addMessage({ role: "assistant", content: `审核提交失败: ${err instanceof Error ? err.message : String(err)}` });
      setPhase("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOutlineEdit = async (editedOutline: string) => {
    if (!threadId) return;
    setIsLoading(true);
    setOutline(editedOutline);
    try {
      const res = await submitReview({ thread_id: threadId, stage: "outline", decision: "edit", feedback: editedOutline });
      if (res.node_status === "outline_review") {
        setOutline(res.data.outline || "");
        addMessage({
          role: "assistant",
          content: "根据您的修改意见，大纲已重新生成，请再次审核：",
          outline: res.data.outline,
          node_status: "outline_review",
        });
        setPhase("outline_review");
      } else if (res.node_status === "answer_review") {
        setDraftAnswer(res.data.draft_answer || "");
        addMessage({
          role: "assistant",
          content: "答案草稿已生成，请审核确认：",
          draft_answer: res.data.draft_answer,
          node_status: "answer_review",
        });
        setPhase("answer_review");
      }
    } catch (err) {
      addMessage({ role: "assistant", content: `大纲修订失败: ${err instanceof Error ? err.message : String(err)}` });
      setPhase("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOutlineReject = async () => {
    if (!threadId) return;
    setIsLoading(true);
    try {
      await submitReview({ thread_id: threadId, stage: "outline", decision: "reject" });
      addMessage({ role: "assistant", content: "已收到您的要求，正在重新检索和生成大纲..." });
      setPhase("researching");
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        startStreamingMessage("正在重新检索...");
        sendChatMessage(
          { query: lastUserMsg.content, thread_id: threadId },
          (event: SSEEvent) => {
            const eventType = event._event || event.node_status;
            if (eventType === "token" && event.content) { appendToken(event.content); return; }
            if (event.node_status === "outline_review") {
              finalizeStreaming();
              setOutline(event.outline || "");
              updateLastAssistant({ outline: event.outline, node_status: "outline_review" });
              setPhase("outline_review");
            } else if (event.node_status === "answer_review") {
              finalizeStreaming();
              setDraftAnswer(event.draft_answer || "");
              updateLastAssistant({ draft_answer: event.draft_answer, node_status: "answer_review" });
              setPhase("answer_review");
            }
          },
          (error: Error) => { finalizeStreaming(); updateLastAssistant({ content: `请求失败: ${error.message}` }); setPhase("error"); setIsLoading(false); },
          () => { finalizeStreaming(); setIsLoading(false); }
        );
      } else { setIsLoading(false); }
    } catch (err) {
      addMessage({ role: "assistant", content: `打回重做失败: ${err instanceof Error ? err.message : String(err)}` });
      setIsLoading(false);
      setPhase("error");
    }
  };

  // ── HITL: 答案审核 ──
  const handleAnswerApprove = async () => {
    if (!threadId) return;
    setIsLoading(true);
    try {
      const res = await submitReview({ thread_id: threadId, stage: "answer", decision: "approve" });
      if (res.node_status === "done") {
        addMessage({ role: "assistant", content: res.data.final_answer || draftAnswer });
        setPhase("done");
        setDraftAnswer("");
      }
    } catch (err) {
      addMessage({ role: "assistant", content: `确认提交失败: ${err instanceof Error ? err.message : String(err)}` });
      setPhase("error");
    } finally { setIsLoading(false); }
  };

  const handleAnswerEdit = async (feedback: string) => {
    if (!threadId) return;
    setIsLoading(true);
    try {
      const res = await submitReview({ thread_id: threadId, stage: "answer", decision: "edit", feedback });
      if (res.node_status === "answer_review") {
        setDraftAnswer(res.data.draft_answer || "");
        addMessage({
          role: "assistant",
          content: "根据您的修改意见，答案已重新生成，请再次审核：",
          draft_answer: res.data.draft_answer,
          node_status: "answer_review",
        });
        setPhase("answer_review");
      }
    } catch (err) {
      addMessage({ role: "assistant", content: `答案修订失败: ${err instanceof Error ? err.message : String(err)}` });
      setPhase("error");
    } finally { setIsLoading(false); }
  };

  const handleAnswerReject = async () => {
    if (!threadId) return;
    setIsLoading(true);
    try {
      await submitReview({ thread_id: threadId, stage: "answer", decision: "reject" });
      addMessage({ role: "assistant", content: "已收到您的要求，正在重新检索和生成..." });
      setPhase("researching");
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        startStreamingMessage("正在重新检索...");
        sendChatMessage(
          { query: lastUserMsg.content, thread_id: threadId },
          (event: SSEEvent) => {
            const eventType = event._event || event.node_status;
            if (eventType === "token" && event.content) { appendToken(event.content); return; }
            if (event.node_status === "outline_review") {
              finalizeStreaming();
              setOutline(event.outline || "");
              updateLastAssistant({ outline: event.outline, node_status: "outline_review" });
              setPhase("outline_review");
            } else if (event.node_status === "answer_review") {
              finalizeStreaming();
              setDraftAnswer(event.draft_answer || "");
              updateLastAssistant({ draft_answer: event.draft_answer, node_status: "answer_review" });
              setPhase("answer_review");
            }
          },
          (error: Error) => { finalizeStreaming(); updateLastAssistant({ content: `请求失败: ${error.message}` }); setPhase("error"); setIsLoading(false); },
          () => { finalizeStreaming(); setIsLoading(false); }
        );
      } else { setIsLoading(false); }
    } catch (err) {
      addMessage({ role: "assistant", content: `打回重做失败: ${err instanceof Error ? err.message : String(err)}` });
      setIsLoading(false);
      setPhase("error");
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* ── 侧边栏 ── */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onNew={handleNew}
        onSelect={handleSelect}
        onRename={handleRename}
        onDelete={handleDelete}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* ── 主内容区 ── */}
      <main
        className={`
          flex flex-col flex-1 min-w-0 transition-all duration-300
          ${sidebarCollapsed ? "lg:ml-[60px]" : "lg:ml-[260px]"}
        `}
      >
        {/* 顶部栏 */}
        <header className="flex items-center justify-between px-4 py-3
          bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm
          border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            {/* 移动端菜单按钮 */}
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Agentic RAG 知识库
            </h1>
          </div>
          <StatusBadge phase={phase} />
        </header>

        {/* 消息区 或 欢迎页 */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <WelcomeScreen onQuickAsk={handleQuickAsk} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map((msg) => (
                <div key={msg.id}>
                  <ChatMessage message={msg} />
                  {msg.node_status === "outline_review" && msg.outline && phase === "outline_review" && (
                    <OutlineReview
                      outline={msg.outline}
                      onApprove={handleOutlineApprove}
                      onEdit={handleOutlineEdit}
                      onReject={handleOutlineReject}
                      disabled={isLoading}
                    />
                  )}
                  {msg.node_status === "answer_review" && msg.draft_answer && phase === "answer_review" && (
                    <AnswerReview
                      draftAnswer={msg.draft_answer}
                      hallucinationCheck={msg.hallucination_check}
                      onApprove={handleAnswerApprove}
                      onEdit={handleAnswerEdit}
                      onReject={handleAnswerReject}
                      disabled={isLoading}
                    />
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 底部输入区 */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800
          bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm pt-3">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            isLoading={isLoading}
          />
        </div>
      </main>
    </div>
  );
}
