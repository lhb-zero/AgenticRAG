// 仪表盘布局 - 左侧导航 + 内容区

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "概览", icon: "📊" },
  { href: "/dashboard/documents", label: "文档管理", icon: "📄" },
  { href: "/dashboard/pipeline", label: "链路追踪", icon: "🔗" },
  { href: "/dashboard/sessions", label: "会话管理", icon: "💬" },
  { href: "/dashboard/settings", label: "系统配置", icon: "⚙️" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            ← 返回对话
          </Link>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-2">
            管理仪表盘
          </h2>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* 内容区 */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
