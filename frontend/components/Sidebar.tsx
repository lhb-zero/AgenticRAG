"use client";

import { useState, useRef, useEffect } from "react";
import { Conversation } from "@/lib/conversation";

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  conversations,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  collapsed,
  onToggle,
}: SidebarProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  // 重命名输入框自动聚焦
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleStartRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
    setMenuOpenId(null);
  };

  const handleConfirmRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <>
      {/* 移动端遮罩 */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* 侧边栏 */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full flex flex-col
          bg-slate-900 text-slate-300 transition-all duration-300
          ${collapsed ? "-translate-x-full lg:translate-x-0 lg:w-[60px]" : "w-[260px]"}
        `}
      >
        {/* 顶部：新对话 + 折叠按钮 */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-700/60">
          <button
            onClick={onNew}
            className={`
              flex items-center gap-2 rounded-lg text-sm font-medium
              bg-blue-600 hover:bg-blue-500 text-white transition-colors
              ${collapsed ? "p-2 mx-auto" : "flex-1 px-3 py-2"}
            `}
            title="新对话"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {!collapsed && <span>新对话</span>}
          </button>
          {!collapsed && (
            <button
              onClick={onToggle}
              className="p-2 rounded-lg hover:bg-slate-700 transition-colors lg:hidden"
              title="收起侧边栏"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* 会话列表 */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
          {sorted.length === 0 && !collapsed && (
            <p className="text-xs text-slate-500 text-center py-8">暂无会话</p>
          )}
          {sorted.map((conv) => (
            <div
              key={conv.id}
              onClick={() => {
                if (renamingId !== conv.id) {
                  onSelect(conv.id);
                }
              }}
              className={`
                group relative flex items-center gap-2 rounded-lg cursor-pointer
                text-sm transition-colors
                ${collapsed ? "justify-center p-2" : "px-3 py-2"}
                ${conv.id === activeId
                  ? "bg-slate-700/80 text-white"
                  : "hover:bg-slate-700/40 text-slate-400"}
              `}
              title={conv.title}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              {!collapsed && (
                renamingId === conv.id ? (
                  /* 重命名输入框 */
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmRename();
                      if (e.key === "Escape") handleCancelRename();
                    }}
                    onBlur={handleConfirmRename}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-slate-800 text-white text-sm px-2 py-0.5
                      rounded border border-blue-500 outline-none"
                  />
                ) : (
                  <span className="truncate flex-1">{conv.title}</span>
                )
              )}

              {/* 三点菜单按钮 */}
              {!collapsed && renamingId !== conv.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                  }}
                  className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100
                    hover:bg-slate-600/60 text-slate-400 hover:text-slate-200 transition-all"
                  title="更多操作"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                    <circle cx="8" cy="3" r="1.5" />
                    <circle cx="8" cy="8" r="1.5" />
                    <circle cx="8" cy="13" r="1.5" />
                  </svg>
                </button>
              )}

              {/* 下拉菜单 */}
              {menuOpenId === conv.id && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full z-50 mt-1 w-36
                    bg-slate-800 border border-slate-700 rounded-lg shadow-xl
                    py-1 animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => handleStartRename(conv.id, conv.title)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm
                      text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    重命名
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpenId(null);
                      onDelete(conv.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm
                      text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    删除
                  </button>
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* 底部：管理后台入口 */}
        <div className="border-t border-slate-700/60 p-3">
          <a
            href="/dashboard"
            className={`
              flex items-center gap-2 rounded-lg text-sm
              hover:bg-slate-700/40 text-slate-400 hover:text-slate-200 transition-colors
              ${collapsed ? "justify-center p-2" : "px-3 py-2"}
            `}
            title="管理后台"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!collapsed && <span>管理后台</span>}
          </a>
        </div>
      </aside>

      {/* 展开按钮（桌面端折叠时显示） */}
      {collapsed && (
        <button
          onClick={onToggle}
          className="hidden lg:flex fixed top-3 left-3 z-50 p-2 rounded-lg
            bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700
            transition-colors shadow-lg"
          title="展开侧边栏"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </>
  );
}
