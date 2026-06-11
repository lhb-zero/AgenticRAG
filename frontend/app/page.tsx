// 主聊天页面 - 消息列表 + 输入框 + HITL 面板

"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage as ChatMessageType, AppPhase, SSEEvent } from "@/lib/types";
import { sendChatMessage, submitReview } from "@/lib/api";
import ChatMessage from "@/components/ChatMessage";
import OutlineReview from "@/components/OutlineReview";
import AnswerReview from "@/components/AnswerReview";

export default function Home() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<AppPhase>("idle");
  const [threadId, setThreadId] = useState<string>("");
  const [outline, setOutline] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastAssistantId, setLastAssistantId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, phase, scrollToBottom]);

  // 添加一条消息
  const addMessage = useCallback(
    (msg: Partial<ChatMessageType> & { role: "user" | "assistant" }) => {
      const newMsg: ChatMessageType = {
        id: uuidv4(),
        timestamp: Date.now(),
        ...msg,
      } as ChatMessageType;
      setMessages((prev) => [...prev, newMsg]);
      return newMsg.id;
    },
    []
  );

  // 更新最后一条 assistant 消息
  const updateLastAssistant = useCallback(
    (updates: Partial<ChatMessageType>) => {
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === "assistant") {
          updated[lastIdx] = { ...updated[lastIdx], ...updates };
        }
        return updated;
      });
    },
    []
  );

  // ── 发送消息 ──
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const tid = threadId || uuidv4();
    if (!threadId) setThreadId(tid);

    // 添加用户消息
    addMessage({ role: "user", content: trimmed });
    setInput("");
    setIsLoading(true);
    setPhase("researching");

    // 添加一条占位 assistant 消息
    const assistantId = addMessage({
      role: "assistant",
      content: "正在分析问题...",
    });
    setLastAssistantId(assistantId);

    sendChatMessage(
      { query: trimmed, thread_id: tid },
      (event: SSEEvent) => {
        // SSE 事件处理
        switch (event.node_status) {
          case "researching":
            updateLastAssistant({ content: "正在检索相关知识库文档..." });
            setPhase("researching");
            break;

          case "outline_review":
            setOutline(event.outline || "");
            updateLastAssistant({
              content: "大纲已生成，请审核确认：",
              outline: event.outline,
              node_status: "outline_review",
            });
            setPhase("outline_review");
            break;

          case "generating":
            updateLastAssistant({ content: "大纲已确认，正在生成答案草稿..." });
            setPhase("generating");
            break;

          case "answer_review":
            setDraftAnswer(event.draft_answer || "");
            updateLastAssistant({
              content: "答案草稿已生成，请审核确认：",
              draft_answer: event.draft_answer,
              node_status: "answer_review",
            });
            setPhase("answer_review");
            break;

          case "done":
            updateLastAssistant({ content: event.final_answer || "" });
            setPhase("done");
            break;

          case "error":
            updateLastAssistant({ content: `错误: ${event.error || "未知错误"}` });
            setPhase("error");
            break;

          default:
            if (event.message) {
              updateLastAssistant({ content: event.message });
            }
        }
      },
      (error: Error) => {
        updateLastAssistant({ content: `请求失败: ${error.message}` });
        setPhase("error");
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      }
    );
  };

  // ── HITL: 大纲审核 ──
  const handleOutlineApprove = async () => {
    if (!threadId) return;
    setIsLoading(true);
    setPhase("generating");

    try {
      const res = await submitReview({
        thread_id: threadId,
        stage: "outline",
        decision: "approve",
      });

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
        addMessage({
          role: "assistant",
          content: res.data.final_answer || "",
        });
        setPhase("done");
      }
    } catch (err) {
      addMessage({
        role: "assistant",
        content: `审核提交失败: ${err instanceof Error ? err.message : String(err)}`,
      });
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
      const res = await submitReview({
        thread_id: threadId,
        stage: "outline",
        decision: "edit",
        feedback: editedOutline,
      });

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
      addMessage({
        role: "assistant",
        content: `大纲修订失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      setPhase("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOutlineReject = async () => {
    if (!threadId) return;
    setIsLoading(true);

    try {
      await submitReview({
        thread_id: threadId,
        stage: "outline",
        decision: "reject",
      });

      addMessage({
        role: "assistant",
        content: "已收到您的要求，正在重新检索和生成大纲...",
      });
      setPhase("researching");
      // 重新发送原始查询
      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        sendChatMessage(
          { query: lastUserMsg.content, thread_id: threadId },
          (event: SSEEvent) => {
            if (event.node_status === "outline_review") {
              setOutline(event.outline || "");
              updateLastAssistant({
                content: "大纲已重新生成，请审核确认：",
                outline: event.outline,
                node_status: "outline_review",
              });
              setPhase("outline_review");
            } else if (event.node_status === "answer_review") {
              setDraftAnswer(event.draft_answer || "");
              updateLastAssistant({
                content: "答案草稿已生成，请审核确认：",
                draft_answer: event.draft_answer,
                node_status: "answer_review",
              });
              setPhase("answer_review");
            } else if (event.message) {
              updateLastAssistant({ content: event.message });
            }
          },
          () => setIsLoading(false),
          () => setIsLoading(false)
        );
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      addMessage({
        role: "assistant",
        content: `打回重做失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      setIsLoading(false);
      setPhase("error");
    }
  };

  // ── HITL: 答案审核 ──
  const handleAnswerApprove = async () => {
    if (!threadId) return;
    setIsLoading(true);

    try {
      const res = await submitReview({
        thread_id: threadId,
        stage: "answer",
        decision: "approve",
      });

      if (res.node_status === "done") {
        addMessage({
          role: "assistant",
          content: res.data.final_answer || draftAnswer,
        });
        setPhase("done");
        setDraftAnswer("");
      }
    } catch (err) {
      addMessage({
        role: "assistant",
        content: `确认提交失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      setPhase("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerEdit = async (feedback: string) => {
    if (!threadId) return;
    setIsLoading(true);

    try {
      const res = await submitReview({
        thread_id: threadId,
        stage: "answer",
        decision: "edit",
        feedback,
      });

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
      addMessage({
        role: "assistant",
        content: `答案修订失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      setPhase("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerReject = async () => {
    if (!threadId) return;
    setIsLoading(true);

    try {
      await submitReview({
        thread_id: threadId,
        stage: "answer",
        decision: "reject",
      });

      addMessage({
        role: "assistant",
        content: "已收到您的要求，正在重新检索和生成...",
      });
      setPhase("researching");

      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
      if (lastUserMsg) {
        sendChatMessage(
          { query: lastUserMsg.content, thread_id: threadId },
          (event: SSEEvent) => {
            if (event.node_status === "outline_review") {
              setOutline(event.outline || "");
              updateLastAssistant({
                content: "大纲已重新生成，请审核确认：",
                outline: event.outline,
                node_status: "outline_review",
              });
              setPhase("outline_review");
            } else if (event.node_status === "answer_review") {
              setDraftAnswer(event.draft_answer || "");
              updateLastAssistant({
                content: "答案草稿已生成，请审核确认：",
                draft_answer: event.draft_answer,
                node_status: "answer_review",
              });
              setPhase("answer_review");
            } else if (event.message) {
              updateLastAssistant({ content: event.message });
            }
          },
          () => setIsLoading(false),
          () => setIsLoading(false)
        );
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      addMessage({
        role: "assistant",
        content: `打回重做失败: ${err instanceof Error ? err.message : String(err)}`,
      });
      setIsLoading(false);
      setPhase("error");
    }
  };

  // ── 清空对话 ──
  const handleClear = () => {
    setMessages([]);
    setThreadId("");
    setPhase("idle");
    setOutline("");
    setDraftAnswer("");
    setIsLoading(false);
  };

  // ── 键盘事件 ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Agentic RAG 知识库
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            企业级智能问答系统 · Human-in-the-Loop
          </p>
        </div>
        <div className="flex items-center gap-3">
          {phase !== "idle" && (
            <span
              className={`text-xs px-3 py-1 rounded-full font-medium ${
                phase === "researching"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : phase === "outline_review"
                  ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                  : phase === "generating"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : phase === "answer_review"
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : phase === "done"
                  ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              }`}
            >
              {phase === "researching" && "检索中..."}
              {phase === "outline_review" && "等待大纲确认"}
              {phase === "generating" && "生成中..."}
              {phase === "answer_review" && "等待答案确认"}
              {phase === "done" && "已完成"}
              {phase === "error" && "出错"}
            </span>
          )}
          <button
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            清空对话
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 dark:text-gray-500 mt-32">
              <p className="text-lg font-medium mb-2">
                欢迎使用 Agentic RAG 知识库系统
              </p>
              <p className="text-sm">
                输入您的问题，系统将自动检索知识库并生成答案。
                <br />
                关键步骤需要您的审核确认。
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <ChatMessage message={msg} />
              {/* 内联 HITL: 大纲审核 */}
              {msg.node_status === "outline_review" &&
                msg.outline &&
                phase === "outline_review" && (
                  <OutlineReview
                    outline={msg.outline}
                    onApprove={handleOutlineApprove}
                    onEdit={handleOutlineEdit}
                    onReject={handleOutlineReject}
                    disabled={isLoading}
                  />
                )}
              {/* 内联 HITL: 答案审核 */}
              {msg.node_status === "answer_review" &&
                msg.draft_answer &&
                phase === "answer_review" && (
                  <AnswerReview
                    draftAnswer={msg.draft_answer}
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
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <textarea
            className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            placeholder="输入您的问题，例如：LangGraph 中的 checkpointer 有什么作用？"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            className="self-end px-6 py-3 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                处理中
              </span>
            ) : (
              "发送"
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
          Shift + Enter 换行 · Enter 发送
        </p>
      </div>
    </div>
  );
}