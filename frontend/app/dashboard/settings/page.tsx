// 系统配置页 — 切换模型 + 调整参数

"use client";

import React, { useEffect, useState } from "react";
import {
  getDashboardConfig,
  switchModel,
  updateParams,
  testCurrentModel,
  type ConfigResponse,
} from "@/lib/api";

export default function SettingsPage() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState("");
  const [params, setParams] = useState<Record<string, number>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await getDashboardConfig();
      setConfig(data);
      setSelectedModel(data.current_model);
      setParams({ ...data.params });
    } catch {
      setMessage({ type: "error", text: "加载失败" });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchModel = async () => {
    setMessage(null);
    try {
      const res = await switchModel(selectedModel);
      setMessage({ type: "success", text: res.message });
      await loadConfig();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "切换失败" });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testCurrentModel());
    } catch {
      setTestResult({ success: false, error: "请求失败" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveParams = async () => {
    setMessage(null);
    if (!config) return;
    const updates: Record<string, number> = {};
    for (const [key, val] of Object.entries(params)) {
      if (val !== (config.params as any)[key]) updates[key] = val;
    }
    if (Object.keys(updates).length === 0) {
      setMessage({ type: "success", text: "没有修改" });
      return;
    }
    try {
      setMessage({ type: "success", text: (await updateParams(updates)).message });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    }
  };

  if (loading || !config) {
    return <div className="flex items-center justify-center h-64 text-gray-500">加载中...</div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">系统配置</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${
          message.type === "success"
            ? "bg-green-50 dark:bg-green-900/20 border border-green-300 text-green-700 dark:text-green-300"
            : "bg-red-50 dark:bg-red-900/20 border border-red-300 text-red-700 dark:text-red-300"
        }`}>{message.text}</div>
      )}

      {/* ── 模型切换 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">🤖 模型</h2>

        <div className="space-y-4">
          {/* 模型选择 */}
          <div className="flex items-center gap-4">
            <label className="w-20 text-sm font-medium text-gray-700 dark:text-gray-300">模型</label>
            <div className="flex gap-2 flex-1">
              {config.models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                    selectedModel === m.id
                      ? "bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-700 dark:text-blue-300 font-medium"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400"
                  }`}
                >
                  {m.name}
                  <span className="block text-xs text-gray-500 mt-0.5">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 按钮 */}
          <div className="flex items-center gap-3 pl-20">
            <button
              onClick={handleSwitchModel}
              disabled={selectedModel === config.current_model}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {selectedModel === config.current_model ? "当前模型" : "切换模型"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-5 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {testing ? "测试中..." : "🧪 测试连接"}
            </button>
            <span className="text-sm text-gray-500">当前: {config.current_model}</span>
          </div>

          {testResult && (
            <div className={`ml-20 p-3 rounded-lg text-sm ${
              testResult.success ? "bg-green-50 dark:bg-green-900/20 border border-green-300" : "bg-red-50 dark:bg-red-900/20 border border-red-300"
            }`}>
              {testResult.success
                ? <span className="text-green-700 dark:text-green-300">✅ {testResult.model} · {testResult.elapsed_s}s · {testResult.response}</span>
                : <span className="text-red-700 dark:text-red-300">❌ {testResult.error}</span>
              }
            </div>
          )}
        </div>
      </div>

      {/* ── 运行参数 ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">⚙️ 运行参数</h2>
          <button onClick={handleSaveParams} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            保存参数
          </button>
        </div>

        <div className="space-y-5">
          <S label="温度" v={params.deepseek_temperature} set={(v) => setParams({...params, deepseek_temperature: v})} min={0} max={2} step={0.1} hint="0=确定性, 2=随机" />
          <S label="最大Token" v={params.deepseek_max_tokens} set={(v) => setParams({...params, deepseek_max_tokens: v})} min={256} max={32768} step={256} hint="生成上限" />
          <S label="分块大小" v={params.chunk_size} set={(v) => setParams({...params, chunk_size: v})} min={100} max={4000} step={100} hint="分块字符数" />
          <S label="分块重叠" v={params.chunk_overlap} set={(v) => setParams({...params, chunk_overlap: v})} min={0} max={1000} step={50} hint="重叠字符数" />
          <S label="Top-K" v={params.top_k_retrieval} set={(v) => setParams({...params, top_k_retrieval: v})} min={1} max={20} step={1} hint="检索文档数" />
          <S label="改写次数" v={params.max_rewrite_attempts} set={(v) => setParams({...params, max_rewrite_attempts: v})} min={0} max={5} step={1} hint="查询重试" />
          <S label="并行查询" v={params.max_search_queries} set={(v) => setParams({...params, max_search_queries: v})} min={1} max={10} step={1} hint="检索查询数" />
        </div>
      </div>
    </div>
  );
}

function S({ label, v, set, min, max, step, hint }: {
  label: string; v: number; set: (v: number) => void; min: number; max: number; step: number; hint?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <label className="w-20 shrink-0 text-sm text-gray-700 dark:text-gray-300">{label}</label>
      <input type="number" value={v} onChange={(e) => set(Number(e.target.value))} min={min} max={max} step={step}
        className="w-24 px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input type="range" value={v} onChange={(e) => set(Number(e.target.value))} min={min} max={max} step={step}
        className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600" />
      {hint && <span className="text-xs text-gray-400 w-24">{hint}</span>}
    </div>
  );
}
