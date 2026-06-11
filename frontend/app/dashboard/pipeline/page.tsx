// 链路追踪页 - 流程图 + 查询追踪

"use client";

import React, { useEffect, useState } from "react";
import {
  getDashboardSessions,
  getDashboardTrace,
  type SessionInfo,
} from "@/lib/api";
import PipelineDiagram from "@/components/PipelineDiagram";

export default function PipelinePage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [trace, setTrace] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [traceLoading, setTraceLoading] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await getDashboardSessions();
      setSessions(data.sessions);
      if (data.sessions.length > 0 && !selectedThread) {
        setSelectedThread(data.sessions[0].thread_id);
        await loadTrace(data.sessions[0].thread_id);
      }
    } catch (err) {
      console.error("加载会话失败:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTrace = async (threadId: string) => {
    setTraceLoading(true);
    setSelectedThread(threadId);
    try {
      const data = await getDashboardTrace(threadId);
      setTrace(data);
    } catch (err) {
      console.error("加载链路失败:", err);
      setTrace(null);
    } finally {
      setTraceLoading(false);
    }
  };

  // 推导已完成节点列表
  const getCompletedNodes = (): string[] => {
    if (!trace) return [];
    const nodes: string[] = [];
    const status = trace.current_status;

    // 根据状态推导已完成的节点
    if (trace.research_plan?.length > 0 || trace.retrieved_docs?.length > 0) {
      nodes.push("research");
    }
    if (trace.outline) {
      nodes.push("generate_outline");
    }
    if (trace.draft_answer) {
      nodes.push("generate_draft");
    }
    if (trace.final_answer) {
      nodes.push("finalize");
    }

    return nodes;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        链路追踪
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：会话列表 */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            会话列表
          </h2>
          {loading ? (
            <p className="text-gray-500 text-center py-4">加载中...</p>
          ) : sessions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">暂无会话</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sessions.map((s) => (
                <button
                  key={s.thread_id}
                  onClick={() => loadTrace(s.thread_id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedThread === s.thread_id
                      ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400 truncate">
                      {s.thread_id.slice(0, 8)}...
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        s.node_status === "done"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : s.has_interrupt
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {s.node_status}
                    </span>
                  </div>
                  {s.query && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                      {s.query}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：流程图 + 详情 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 流程图 */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              执行流程
            </h2>
            <PipelineDiagram
              activeNode={trace?.current_status === "outline_review" ? "generate_outline" : trace?.current_status === "answer_review" ? "generate_draft" : trace?.current_status === "done" ? "finalize" : undefined}
              completedNodes={getCompletedNodes()}
            />
          </div>

          {/* 详情 */}
          {traceLoading ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <p className="text-gray-500 text-center py-8">加载链路数据...</p>
            </div>
          ) : trace ? (
            <div className="space-y-4">
              {/* 查询 */}
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">原始查询</h3>
                <p className="text-gray-900 dark:text-white">{trace.query || "-"}</p>
              </div>

              {/* 检索计划 */}
              {trace.research_plan?.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">检索计划</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {trace.research_plan.map((q: string, i: number) => (
                      <li key={i} className="text-sm text-gray-700 dark:text-gray-300">
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 文档打分 */}
              {trace.doc_grades?.length > 0 && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">文档打分</h3>
                  <div className="space-y-2">
                    {trace.doc_grades.map((g: any, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            g.grade === "relevant"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                              : g.grade === "partial"
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}
                        >
                          {g.grade}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {g.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 幻觉检测 */}
              {trace.hallucination_check?.grade &&
                trace.hallucination_check.grade !== "unknown" && (
                  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                    <h3 className="text-sm font-medium text-gray-500 mb-2">
                      幻觉检测
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          trace.hallucination_check.grade === "faithful"
                            ? "bg-green-500"
                            : "bg-red-500"
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          trace.hallucination_check.grade === "faithful"
                            ? "text-green-700 dark:text-green-300"
                            : "text-red-700 dark:text-red-300"
                        }`}
                      >
                        {trace.hallucination_check.grade === "faithful"
                          ? "内容忠实于文档"
                          : "存在未验证内容"}
                      </span>
                    </div>
                    {trace.hallucination_check.reason && (
                      <p className="text-xs text-gray-500 mt-1">
                        {trace.hallucination_check.reason}
                      </p>
                    )}
                  </div>
                )}

              {/* 大纲 */}
              {trace.outline && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">生成大纲</h3>
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {trace.outline}
                  </pre>
                </div>
              )}

              {/* 最终答案 */}
              {trace.final_answer && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">最终答案</h3>
                  <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {trace.final_answer}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <p className="text-gray-500 text-center py-8">
                选择一个会话查看执行链路
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
