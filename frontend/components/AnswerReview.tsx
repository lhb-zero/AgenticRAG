// 答案审核组件 - HITL: 修订/确认最终答案 + 幻觉检测展示

"use client";

import React, { useState } from "react";
import type { HallucinationCheck } from "@/lib/types";

interface Props {
  draftAnswer: string;
  hallucinationCheck?: HallucinationCheck;
  onApprove: () => void;
  onEdit: (feedback: string) => void;
  onReject: () => void;
  disabled?: boolean;
}

export default function AnswerReview({
  draftAnswer,
  hallucinationCheck,
  onApprove,
  onEdit,
  onReject,
  disabled = false,
}: Props) {
  const [feedback, setFeedback] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const handleEditSubmit = () => {
    if (feedback.trim()) {
      onEdit(feedback);
      setIsEditing(false);
      setFeedback("");
    }
  };

  return (
    <div className="border border-green-400 bg-green-50 dark:bg-green-900/20 rounded-xl p-5 my-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
          答案审核
        </h3>
        <span className="text-xs px-2 py-1 bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 rounded-full">
          等待确认
        </span>
      </div>

      {/* 幻觉检测结果 */}
      {hallucinationCheck && hallucinationCheck.grade !== "unknown" && (
        <div
          className={`mb-4 p-3 rounded-lg border ${
            hallucinationCheck.grade === "faithful"
              ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
              : "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            {hallucinationCheck.grade === "faithful" ? (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  幻觉检测通过 — 内容忠实于文档
                </span>
              </>
            ) : (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                <span className="text-sm font-medium text-red-800 dark:text-red-200">
                  幻觉检测警告 — 存在未验证内容
                </span>
              </>
            )}
          </div>
          {hallucinationCheck.reason && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {hallucinationCheck.reason}
            </p>
          )}
          {hallucinationCheck.hallucinated_parts &&
            hallucinationCheck.hallucinated_parts.length > 0 && (
              <ul className="text-xs text-red-600 dark:text-red-400 mt-1 list-disc list-inside">
                {hallucinationCheck.hallucinated_parts.map((part, i) => (
                  <li key={i}>{part}</li>
                ))}
              </ul>
            )}
        </div>
      )}

      <div className="prose prose-sm dark:prose-invert max-w-none mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 max-h-96 overflow-y-auto">
        <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
          {draftAnswer}
        </div>
      </div>

      {isEditing && (
        <div className="mb-4">
          <textarea
            className="w-full h-24 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="请输入修改建议，例如：请补充数据安全方面的内容..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
      )}

      <div className="flex gap-3 justify-end">
        {isEditing ? (
          <>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              onClick={() => setIsEditing(false)}
              disabled={disabled}
            >
              取消
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleEditSubmit}
              disabled={disabled || !feedback.trim()}
            >
              提交修改意见
            </button>
          </>
        ) : (
          <>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
              onClick={onReject}
              disabled={disabled}
            >
              打回重做
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 disabled:opacity-50"
              onClick={() => setIsEditing(true)}
              disabled={disabled}
            >
              提出修改意见
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              onClick={onApprove}
              disabled={disabled}
            >
              确认输出
            </button>
          </>
        )}
      </div>
    </div>
  );
}
