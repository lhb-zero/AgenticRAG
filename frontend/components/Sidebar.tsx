"use client";

import { useState, useRef, useEffect } from "react";
import { Conversation, Group } from "@/lib/conversation";

interface SidebarProps {
  conversations: Conversation[];
  groups: Group[];
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, newName: string) => void;
  onDeleteGroup: (id: string) => void;
  onMoveToGroup: (convId: string, groupId: string | null) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({
  conversations,
  groups,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveToGroup,
  collapsed,
  onToggle,
}: SidebarProps) {
  // ── 菜单/重命名状态 ──
  const [convMenuId, setConvMenuId] = useState<string | null>(null);
  const [groupMenuId, setGroupMenuId] = useState<string | null>(null);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // 点击外部关闭所有菜单
  useEffect(() => {
    const hasOpen = convMenuId || groupMenuId || moveMenuId;
    if (!hasOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setConvMenuId(null);
        setGroupMenuId(null);
        setMoveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [convMenuId, groupMenuId, moveMenuId]);

  // 重命名输入框自动聚焦
  useEffect(() => {
    if (renamingConvId || renamingGroupId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingConvId, renamingGroupId]);

  // ── 分组折叠 ──
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  // ── 数据分组 ──
  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  const grouped = new Map<string | null, Conversation[]>();
  // 先按 groupId 分组
  for (const conv of sorted) {
    const key = conv.groupId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(conv);
  }
  // 确保分组顺序：有名字的分组按创建时间，最后是未分组
  const groupOrder = groups.map((g) => g.id);
  const ungrouped = grouped.get(null) || [];

  // ── 重命名逻辑 ──
  const startRenameConv = (id: string, title: string) => {
    setRenamingConvId(id);
    setRenameValue(title);
    setConvMenuId(null);
  };
  const startRenameGroup = (id: string, name: string) => {
    setRenamingGroupId(id);
    setRenameValue(name);
    setGroupMenuId(null);
  };
  const confirmRename = () => {
    if (renamingConvId && renameValue.trim()) onRename(renamingConvId, renameValue.trim());
    if (renamingGroupId && renameValue.trim()) onRenameGroup(renamingGroupId, renameValue.trim());
    setRenamingConvId(null);
    setRenamingGroupId(null);
    setRenameValue("");
  };
  const cancelRename = () => {
    setRenamingConvId(null);
    setRenamingGroupId(null);
    setRenameValue("");
  };

  // ── 新建分组 ──
  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      onCreateGroup(newGroupName.trim());
      setNewGroupName("");
      setShowNewGroup(false);
    }
  };

  // ── 渲染单条会话 ──
  const renderConv = (conv: Conversation) => (
    <div
      key={conv.id}
      onClick={() => renamingConvId !== conv.id && onSelect(conv.id)}
      className={`
        group relative flex items-center gap-2 rounded-lg cursor-pointer
        text-sm transition-colors px-3 py-2
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

      {renamingConvId === conv.id ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => { e.key === "Enter" && confirmRename(); e.key === "Escape" && cancelRename(); }}
          onBlur={confirmRename}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-slate-800 text-white text-sm px-2 py-0.5 rounded border border-blue-500 outline-none"
        />
      ) : (
        <span className="truncate flex-1">{conv.title}</span>
      )}

      {/* 会话三点菜单 */}
      {renamingConvId !== conv.id && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConvMenuId(convMenuId === conv.id ? null : conv.id);
            setGroupMenuId(null);
            setMoveMenuId(null);
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

      {/* 会话下拉菜单 */}
      {convMenuId === conv.id && (
        <div ref={menuRef} className="absolute right-0 top-full z-50 mt-1 w-40
          bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => startRenameConv(conv.id, conv.title)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            重命名
          </button>
          {/* 移动到分组 */}
          <button onClick={() => { setMoveMenuId(conv.id); setConvMenuId(null); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            移动到分组
          </button>
          <hr className="my-1 border-slate-700" />
          <button onClick={() => { setConvMenuId(null); onDelete(conv.id); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除
          </button>
        </div>
      )}

      {/* 移动到分组子菜单 */}
      {moveMenuId === conv.id && (
        <div ref={menuRef} className="absolute right-0 top-full z-50 mt-1 w-44
          bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 animate-fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { onMoveToGroup(conv.id, null); setMoveMenuId(null); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
              ${!conv.groupId ? "text-blue-400" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            未分组
            {!conv.groupId && <span className="ml-auto text-xs">✓</span>}
          </button>
          {groups.map((g) => (
            <button key={g.id} onClick={() => { onMoveToGroup(conv.id, g.id); setMoveMenuId(null); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors
                ${conv.groupId === g.id ? "text-blue-400" : "text-slate-300 hover:bg-slate-700 hover:text-white"}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="truncate">{g.name}</span>
              {conv.groupId === g.id && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}
          <hr className="my-1 border-slate-700" />
          <button onClick={() => { setMoveMenuId(null); setShowNewGroup(true); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新建分组
          </button>
        </div>
      )}
    </div>
  );

  // ── 渲染分组 ──
  const renderGroup = (group: Group) => {
    const convs = grouped.get(group.id) || [];
    const isCollapsed = collapsedGroups.has(group.id);

    return (
      <div key={group.id} className="mb-1">
        {/* 分组标题 */}
        <div
          className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md
            text-[11px] font-semibold uppercase tracking-wider text-slate-500
            hover:bg-slate-700/30 cursor-pointer transition-colors"
          onClick={() => toggleGroup(group.id)}
        >
          <svg className={`w-3 h-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {renamingGroupId === group.id ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { e.key === "Enter" && confirmRename(); e.key === "Escape" && cancelRename(); }}
              onBlur={confirmRename}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-slate-800 text-white text-xs px-1.5 py-0.5 rounded border border-blue-500 outline-none"
            />
          ) : (
            <span className="flex-1 truncate">{group.name}</span>
          )}

          {/* 分组三点菜单 */}
          {renamingGroupId !== group.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setGroupMenuId(groupMenuId === group.id ? null : group.id);
                setConvMenuId(null);
                setMoveMenuId(null);
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100
                hover:bg-slate-600/60 text-slate-500 hover:text-slate-300 transition-all"
              title="分组操作"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <circle cx="8" cy="3" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="13" r="1.5" />
              </svg>
            </button>
          )}

          {/* 分组菜单 */}
          {groupMenuId === group.id && (
            <div ref={menuRef} className="absolute right-2 mt-6 z-50 w-36
              bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 animate-fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => startRenameGroup(group.id, group.name)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                重命名
              </button>
              <button onClick={() => { setGroupMenuId(null); onDeleteGroup(group.id); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                删除分组
              </button>
            </div>
          )}
        </div>

        {/* 分组下的会话 */}
        {!isCollapsed && <div className="ml-2 space-y-0.5">{convs.map(renderConv)}</div>}
      </div>
    );
  };

  return (
    <>
      {/* 移动端遮罩 */}
      {!collapsed && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onToggle} />
      )}

      {/* 侧边栏 */}
      <aside className={`
        fixed top-0 left-0 z-40 h-full flex flex-col
        bg-slate-900/95 backdrop-blur-xl text-slate-300
        border-r border-slate-700/30
        transition-all duration-300
        ${collapsed ? "-translate-x-full lg:translate-x-0 lg:w-[60px]" : "w-[260px]"}
      `}>
        {/* 顶部：新对话 */}
        <div className="flex items-center gap-2 p-3 border-b border-slate-700/60">
          <button onClick={onNew}
            className={`flex items-center gap-2 rounded-lg text-sm font-medium
              bg-blue-600 hover:bg-blue-500 text-white transition-colors
              ${collapsed ? "p-2 mx-auto" : "flex-1 px-3 py-2"}`}
            title="新对话"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {!collapsed && <span>新对话</span>}
          </button>
          {!collapsed && (
            <button onClick={onToggle}
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
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {sorted.length === 0 && !collapsed && (
            <p className="text-xs text-slate-500 text-center py-8">暂无会话</p>
          )}

          {!collapsed && (
            <>
              {/* 有分组的会话 */}
              {groupOrder.map((gid) => {
                const group = groups.find((g) => g.id === gid);
                if (!group) return null;
                return renderGroup(group);
              })}

              {/* 新建分组输入框 */}
              {showNewGroup && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 mb-1">
                  <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => { e.key === "Enter" && handleCreateGroup(); e.key === "Escape" && setShowNewGroup(false); }}
                    onBlur={() => { if (newGroupName.trim()) handleCreateGroup(); else setShowNewGroup(false); }}
                    placeholder="分组名称..."
                    className="flex-1 min-w-0 bg-slate-800 text-white text-xs px-2 py-1 rounded border border-blue-500 outline-none"
                    autoFocus
                  />
                </div>
              )}

              {/* 未分组会话 */}
              {ungrouped.length > 0 && (
                <>
                  {groups.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 mt-2
                      text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                      未分组
                    </div>
                  )}
                  <div className="space-y-0.5">{ungrouped.map(renderConv)}</div>
                </>
              )}

              {/* 新建分组按钮 */}
              {!showNewGroup && (
                <button onClick={() => setShowNewGroup(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 mt-2 rounded-lg
                    text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  新建分组
                </button>
              )}
            </>
          )}
        </nav>

        {/* 底部：管理后台 */}
        <div className="border-t border-slate-700/60 p-3">
          <a href="/dashboard"
            className={`flex items-center gap-2 rounded-lg text-sm
              hover:bg-slate-700/40 text-slate-400 hover:text-slate-200 transition-colors
              ${collapsed ? "justify-center p-2" : "px-3 py-2"}`}
            title="管理后台"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {!collapsed && <span>管理后台</span>}
          </a>
        </div>
      </aside>

      {/* 展开按钮 */}
      {collapsed && (
        <button onClick={onToggle}
          className="hidden lg:flex fixed top-3 left-3 z-50 p-2 rounded-lg
            bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-lg"
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
