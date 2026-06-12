"use client";

import { useRef, useEffect, useCallback } from "react";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  isLoading,
  disabled,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="relative flex items-end gap-3
        rounded-2xl px-4 py-3
        bg-white/60 dark:bg-slate-800/60
        border border-slate-200/60 dark:border-slate-700/40
        shadow-sm hover:shadow-md focus-glow
        transition-all duration-300"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题… (Shift+Enter 换行)"
          rows={1}
          disabled={disabled || isLoading}
          className="flex-1 resize-none bg-transparent text-sm
            text-slate-800 dark:text-slate-100
            placeholder-slate-400 dark:placeholder-slate-500
            focus:outline-none disabled:opacity-50
            leading-relaxed"
          style={{ maxHeight: "200px" }}
        />
        <button
          onClick={onSend}
          disabled={!value.trim() || isLoading || disabled}
          className="shrink-0 w-9 h-9 flex items-center justify-center
            rounded-xl transition-all duration-200
            bg-gradient-to-br from-blue-500 to-indigo-600
            hover:from-blue-400 hover:to-indigo-500
            shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30
            disabled:from-slate-200 disabled:to-slate-200
            dark:disabled:from-slate-700 dark:disabled:to-slate-700
            disabled:shadow-none disabled:cursor-not-allowed
            text-white disabled:text-slate-400
            active:scale-95"
          title="发送 (Enter)"
        >
          {isLoading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
          )}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500/60 text-center mt-2.5">
        Agentic RAG · LangGraph 自我纠错检索
      </p>
    </div>
  );
}
