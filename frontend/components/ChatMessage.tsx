// 单条消息渲染组件 - 现代 LLM 对话风格
// 用户消息：右对齐蓝色气泡
// 助手消息：左对齐无背景，纯文本 + Markdown 渲染

"use client";

import React, { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage as ChatMessageType } from "@/lib/types";

interface Props {
  message: ChatMessageType;
}

// 格式化时间戳
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return time;

  const date = d.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
  return `${date} ${time}`;
}

// 复制图标
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

// 勾选图标（复制成功后显示）
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === "user";
  const isStreaming = message.isStreaming;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = message.content;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [message.content]);

  return (
    <div className={`msg-enter flex gap-4 py-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* 头像 */}
      <div
        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold mt-1 ${
          isUser
            ? "bg-blue-600"
            : "bg-gradient-to-br from-indigo-500 to-purple-600"
        }`}
      >
        {isUser ? "你" : "AI"}
      </div>

      {/* 消息内容 */}
      <div className={`flex flex-col min-w-0 ${isUser ? "items-end max-w-[70%]" : "items-start flex-1"}`}>
        {/* 角色标签 + 时间 */}
        <div className="flex items-center gap-2.5 mb-2 px-0.5">
          <span className={`text-xs font-semibold ${
            isUser
              ? "text-blue-600 dark:text-blue-400"
              : "text-indigo-600 dark:text-indigo-400"
          }`}>
            {isUser ? "你" : "Agentic RAG"}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {formatTime(message.timestamp)}
          </span>
        </div>

        {isUser ? (
          /* 用户消息：蓝色气泡 */
          <div className="rounded-2xl rounded-tr-md bg-gradient-to-br from-blue-500 to-indigo-600
            text-white px-4 py-2.5 shadow-md shadow-blue-500/15">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
        ) : isStreaming ? (
          /* 助手消息：流式输出中 */
          <div className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words leading-[1.8] max-w-none
            bg-white/50 dark:bg-slate-800/40 rounded-2xl rounded-tl-md px-4 py-3
            border border-slate-100/80 dark:border-slate-700/30">
            {message.content}
            <span className="streaming-cursor" />
          </div>
        ) : (
          /* 助手消息：完整 Markdown 渲染 */
          <div className="group/msg">
            <div className="chat-markdown text-sm text-slate-800 dark:text-slate-100 leading-[1.8] max-w-none
              bg-white/50 dark:bg-slate-800/40 rounded-2xl rounded-tl-md px-4 py-3
              border border-slate-100/80 dark:border-slate-700/30">
              <ReactMarkdown
                components={{
                  // 代码块：深色背景 + 圆角
                  pre: ({ children }) => (
                    <pre className="my-3 rounded-xl bg-slate-900 dark:bg-slate-950 text-slate-100
                      overflow-x-auto text-[13px] leading-relaxed border border-slate-700/50">
                      {children}
                    </pre>
                  ),
                  // 行内代码
                  code: ({ className, children, ...props }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return <code className={className} {...props}>{children}</code>;
                    }
                    return (
                      <code className="px-1.5 py-0.5 rounded-md text-pink-600 dark:text-pink-400
                        bg-pink-50 dark:bg-pink-900/20 text-[13px] font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                  // 标题
                  h1: ({ children }) => <h1 className="text-xl font-bold mt-6 mb-3 text-slate-900 dark:text-white">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2 text-slate-900 dark:text-white">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2 text-slate-800 dark:text-slate-100">{children}</h3>,
                  // 段落
                  p: ({ children }) => <p className="my-2">{children}</p>,
                  // 列表
                  ul: ({ children }) => <ul className="my-2 ml-1 space-y-1 list-disc list-outside marker:text-slate-400 dark:marker:text-slate-500">{children}</ul>,
                  ol: ({ children }) => <ol className="my-2 ml-1 space-y-1 list-decimal list-outside marker:text-slate-400 dark:marker:text-slate-500">{children}</ol>,
                  li: ({ children }) => <li className="pl-1.5">{children}</li>,
                  // 引用
                  blockquote: ({ children }) => (
                    <blockquote className="my-3 pl-4 border-l-3 border-blue-400 dark:border-blue-500
                      text-slate-600 dark:text-slate-400 italic">
                      {children}
                    </blockquote>
                  ),
                  // 表格
                  table: ({ children }) => (
                    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="w-full text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-slate-50 dark:bg-slate-800">{children}</thead>,
                  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold border-b border-slate-200 dark:border-slate-700">{children}</th>,
                  td: ({ children }) => <td className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">{children}</td>,
                  // 水平线
                  hr: () => <hr className="my-4 border-slate-200 dark:border-slate-700" />,
                  // 链接
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-2">
                      {children}
                    </a>
                  ),
                  // 加粗
                  strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-white">{children}</strong>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* 底部操作栏 - 悬停时显示，类似 ChatGPT */}
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover/msg:opacity-100
              transition-opacity duration-150">
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  transition-all duration-150
                  ${copied
                    ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                title="复制"
              >
                {copied ? (
                  <>
                    <CheckIcon className="text-green-500 w-3.5 h-3.5" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <CopyIcon className="w-3.5 h-3.5" />
                    <span>复制</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
