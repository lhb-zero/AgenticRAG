// 仪表盘概览 - 统计卡片 + 系统状态

"use client";

import React, { useEffect, useState } from "react";
import { getDashboardStats, testGraph, type DashboardStats } from "@/lib/api";

export default function DashboardOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, healthData] = await Promise.all([
        getDashboardStats(),
        testGraph({ query: "健康检查", thread_id: "health-check" }),
      ]);
      setStats(statsData);
      setHealth(healthData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-xl p-6">
        <p className="text-red-700 dark:text-red-300">加载失败: {error}</p>
        <button
          onClick={loadData}
          className="mt-3 px-4 py-2 text-sm bg-red-100 dark:bg-red-900/40 rounded-lg"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        系统概览
      </h1>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="文档分块"
          value={stats?.vectorstore?.total_chunks ?? 0}
          subtitle={`${stats?.vectorstore?.unique_documents ?? 0} 篇文档`}
          color="blue"
        />
        <StatCard
          title="活跃会话"
          value={stats?.sessions?.active ?? 0}
          subtitle={`共 ${stats?.sessions?.total ?? 0} 个会话`}
          color="green"
        />
        <StatCard
          title="FAISS 索引"
          value={`${((stats?.index_files?.faiss_size_kb ?? 0) + (stats?.index_files?.pkl_size_kb ?? 0)).toFixed(0)} KB`}
          subtitle="索引文件大小"
          color="purple"
        />
        <StatCard
          title="LLM 模型"
          value={stats?.config?.llm_model ?? "-"}
          subtitle={`Embedding: ${stats?.config?.embedding_model ?? "-"}`}
          color="orange"
        />
      </div>

      {/* 系统健康 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          系统健康检查
        </h2>
        {health ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HealthItem
              name="LLM (DeepSeek)"
              ok={health.results?.llm?.ok}
              detail={health.results?.llm?.ok ? `${health.results.llm.elapsed_s}s` : health.results?.llm?.error}
            />
            <HealthItem
              name="Embedding (Ollama)"
              ok={health.results?.embedding?.ok}
              detail={health.results?.embedding?.ok ? `${health.results.embedding.dimension}维 ${health.results.embedding.elapsed_s}s` : health.results?.embedding?.error}
            />
            <HealthItem
              name="FAISS 向量库"
              ok={health.results?.faiss?.ok}
              detail={health.results?.faiss?.ok ? `${health.results.faiss.doc_count}个分块 ${health.results.faiss.elapsed_s}s` : health.results?.faiss?.error}
            />
          </div>
        ) : (
          <p className="text-gray-500">未连接</p>
        )}
      </div>

      {/* 文档列表预览 */}
      {stats?.vectorstore?.documents && stats.vectorstore.documents.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            已索引文档
          </h2>
          <div className="space-y-2">
            {stats.vectorstore.documents.map((doc) => (
              <div
                key={doc.title}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {doc.title}
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {doc.chunks} 个分块
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 刷新按钮 */}
      <div className="text-center">
        <button
          onClick={loadData}
          className="px-6 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          刷新数据
        </button>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colorMap = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
    green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
    orange: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
  };
  const textColor = {
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-green-700 dark:text-green-300",
    purple: "text-purple-700 dark:text-purple-300",
    orange: "text-orange-700 dark:text-orange-300",
  };

  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textColor[color]}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}

function HealthItem({
  name,
  ok,
  detail,
}: {
  name: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
      <span
        className={`inline-block w-3 h-3 rounded-full ${
          ok ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {name}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>
      </div>
    </div>
  );
}
