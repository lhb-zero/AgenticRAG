// 文档管理页 - 列表 / 上传(自动索引) / 分块弹窗 / 删除

"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  getDashboardDocuments,
  getDocumentChunks,
  deleteDashboardDocument,
  uploadDocument,
  buildIndex,
  type DocInfo,
} from "@/lib/api";

interface ChunkInfo {
  content: string;
  metadata: Record<string, string>;
  length: number;
}

const PAGE_SIZE = 10; // 每页显示的分块数

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocInfo[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 弹窗状态
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalChunks, setModalChunks] = useState<ChunkInfo[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalPage, setModalPage] = useState(0);
  const [modalSearch, setModalSearch] = useState("");

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await getDashboardDocuments();
      setDocs(data.documents);
      setTotalChunks(data.total_chunks);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载失败",
      });
    } finally {
      setLoading(false);
    }
  };

  // 上传 → 自动索引
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage({ type: "info", text: `正在上传 "${file.name}"...` });
    try {
      await uploadDocument(file);
      setMessage({ type: "info", text: `上传成功，正在构建索引...` });
      const result = await buildIndex("uploaded");
      setMessage({
        type: "success",
        text: `"${file.name}" 上传并索引成功，共 ${result.chunk_count} 个分块`,
      });
      await loadDocs();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "上传失败",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 打开分块弹窗
  const handleViewChunks = async (title: string) => {
    setModalOpen(true);
    setModalTitle(title);
    setModalLoading(true);
    setModalPage(0);
    setModalSearch("");
    try {
      const data = await getDocumentChunks(title);
      setModalChunks(data.chunks);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "获取分块失败",
      });
      setModalChunks([]);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (title: string) => {
    if (!confirm(`确定删除文档 "${title}"？此操作不可撤销。`)) return;
    setMessage(null);
    try {
      const res = await deleteDashboardDocument(title);
      setMessage({
        type: "success",
        text: `已删除 "${title}"（${res.deleted_chunks} 个分块）`,
      });
      await loadDocs();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "删除失败",
      });
    }
  };

  // 弹窗内过滤 + 分页
  const filteredChunks = modalSearch
    ? modalChunks.filter(
        (c) =>
          c.content.toLowerCase().includes(modalSearch.toLowerCase()) ||
          Object.values(c.metadata).some((v) =>
            String(v).toLowerCase().includes(modalSearch.toLowerCase())
          )
      )
    : modalChunks;

  const totalPages = Math.ceil(filteredChunks.length / PAGE_SIZE);
  const pagedChunks = filteredChunks.slice(
    modalPage * PAGE_SIZE,
    (modalPage + 1) * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        文档管理
      </h1>

      {/* 消息提示 */}
      {message && (
        <div
          className={`p-4 rounded-lg border ${
            message.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
              : message.type === "info"
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
          }`}
        >
          {uploading && <span className="inline-block animate-spin mr-2">⏳</span>}
          {message.text}
        </div>
      )}

      {/* 上传区域 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          上传文档
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          上传后自动构建向量索引。支持：.txt, .pdf, .docx, .doc, .md
        </p>
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx,.doc,.md"
            onChange={handleUpload}
            disabled={uploading}
            className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300 hover:file:bg-blue-100 disabled:opacity-50"
          />
          {uploading && (
            <span className="text-sm text-blue-600 dark:text-blue-400">处理中...</span>
          )}
        </div>
      </div>

      {/* 文档列表 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            已索引文档
          </h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              共 {docs.length} 篇 · {totalChunks} 个分块
            </span>
            <button
              onClick={loadDocs}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              刷新
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500 text-center py-8">加载中...</p>
        ) : docs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-2">暂无文档</p>
            <p className="text-sm text-gray-400">上传文档后系统会自动构建索引</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">文档标题</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">来源</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">分块数</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.title}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 dark:text-white truncate max-w-sm">
                        {doc.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-sm mt-0.5">
                        {doc.sample}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 text-xs">
                      {doc.source || "-"}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full text-xs font-medium">
                        {doc.chunks}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleViewChunks(doc.title)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors mr-2"
                      >
                        查看分块
                      </button>
                      <button
                        onClick={() => handleDelete(doc.title)}
                        className="text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors"
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

      {/* ── 分块查看弹窗 ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 背景遮罩 */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setModalOpen(false)}
          />
          {/* 弹窗主体 */}
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4">
            {/* 弹窗头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  分块详情
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {modalTitle} · 共 {modalChunks.length} 个分块
                </p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 搜索栏 */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800">
              <input
                type="text"
                placeholder="搜索分块内容或 metadata..."
                value={modalSearch}
                onChange={(e) => {
                  setModalSearch(e.target.value);
                  setModalPage(0);
                }}
                className="w-full px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {modalSearch && (
                <p className="text-xs text-gray-500 mt-1">
                  匹配 {filteredChunks.length} / {modalChunks.length} 个分块
                </p>
              )}
            </div>

            {/* 分块列表 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {modalLoading ? (
                <p className="text-gray-500 text-center py-12">加载中...</p>
              ) : pagedChunks.length === 0 ? (
                <p className="text-gray-500 text-center py-12">
                  {modalSearch ? "没有匹配的分块" : "无分块数据"}
                </p>
              ) : (
                pagedChunks.map((chunk, i) => {
                  const globalIdx = modalPage * PAGE_SIZE + i;
                  return (
                    <div
                      key={globalIdx}
                      className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          分块 #{globalIdx + 1}
                        </span>
                        <span className="text-xs text-gray-400">
                          {chunk.length} 字符
                        </span>
                      </div>
                      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-sans leading-relaxed">
                        {chunk.content}
                      </pre>
                      {Object.keys(chunk.metadata).length > 0 && (
                        <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                          {Object.entries(chunk.metadata).map(([key, val]) => (
                            <span
                              key={key}
                              className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded"
                            >
                              {key}: {val}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-800">
                <span className="text-sm text-gray-500">
                  第 {modalPage + 1} / {totalPages} 页
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalPage((p) => Math.max(0, p - 1))}
                    disabled={modalPage === 0}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() =>
                      setModalPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={modalPage >= totalPages - 1}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
