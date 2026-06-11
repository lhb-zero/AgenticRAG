// 会话管理页 - 列表 / 查看 / 删除

"use client";

import React, { useEffect, useState } from "react";
import {
  getDashboardSessions,
  deleteDashboardSession,
  type SessionInfo,
} from "@/lib/api";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await getDashboardSessions();
      setSessions(data.sessions);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载失败",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (threadId: string) => {
    if (!confirm(`确定删除会话 ${threadId.slice(0, 8)}...？`)) return;

    setMessage(null);
    try {
      await deleteDashboardSession(threadId);
      setMessage({ type: "success", text: "会话已删除" });
      await loadSessions();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "删除失败",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300";
      case "outline_review":
      case "answer_review":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "researching":
      case "generating":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
      case "error":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          会话管理
        </h1>
        <button
          onClick={loadSessions}
          className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          刷新
        </button>
      </div>

      {/* 消息提示 */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
              : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 会话列表 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        {loading ? (
          <p className="text-gray-500 text-center py-8">加载中...</p>
        ) : sessions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">暂无会话记录</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    会话 ID
                  </th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">
                    查询
                  </th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">
                    状态
                  </th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">
                    中断
                  </th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.thread_id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 px-4">
                      <a
                        href={`/dashboard/pipeline?thread=${s.thread_id}`}
                        className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {s.thread_id.slice(0, 12)}...
                      </a>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 max-w-xs truncate">
                      {s.query || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-xs px-2 py-1 rounded ${getStatusColor(
                          s.node_status
                        )}`}
                      >
                        {s.node_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {s.has_interrupt ? (
                        <span className="text-xs text-yellow-600 dark:text-yellow-400">
                          ⚠ 等待中
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDelete(s.thread_id)}
                        className="text-red-600 dark:text-red-400 hover:underline text-sm"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
