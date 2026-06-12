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
    <div
      className="rounded-xl p-5 my-3 border"
      style={{
        backgroundColor: "#dcfce7", // green-100
        borderColor: "#22c55e", // green-500
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold" style={{ color: "#166534" }}>
          答案审核
        </h3>
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{ backgroundColor: "#bbf7d0", color: "#166534" }}
        >
          等待确认
        </span>
      </div>

      {/* 幻觉检测结果 */}
      {hallucinationCheck && hallucinationCheck.grade !== "unknown" && (
        <div
          className="mb-4 p-3 rounded-lg border"
          style={{
            backgroundColor:
              hallucinationCheck.grade === "faithful" ? "#dcfce7" : "#fee2e2",
            borderColor:
              hallucinationCheck.grade === "faithful" ? "#86efac" : "#fca5a5",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            {hallucinationCheck.grade === "faithful" ? (
              <>
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#22c55e" }}
                />
                <span className="text-sm font-medium" style={{ color: "#166534" }}>
                  幻觉检测通过 — 内容忠实于文档
                </span>
              </>
            ) : (
              <>
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: "#ef4444" }}
                />
                <span className="text-sm font-medium" style={{ color: "#991b1b" }}>
                  幻觉检测警告 — 存在未验证内容
                </span>
              </>
            )}
          </div>
          {hallucinationCheck.reason && (
            <p className="text-xs mt-1" style={{ color: "#4b5563" }}>
              {hallucinationCheck.reason}
            </p>
          )}
          {hallucinationCheck.hallucinated_parts &&
            hallucinationCheck.hallucinated_parts.length > 0 && (
              <ul className="text-xs mt-1 list-disc list-inside" style={{ color: "#dc2626" }}>
                {hallucinationCheck.hallucinated_parts.map((part, i) => (
                  <li key={i}>{part}</li>
                ))}
              </ul>
            )}
        </div>
      )}

      <div
        className="mb-4 p-4 rounded-lg border max-h-96 overflow-y-auto"
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#e5e7eb",
        }}
      >
        <div className="whitespace-pre-wrap text-sm" style={{ color: "#1f2937" }}>
          {draftAnswer}
        </div>
      </div>

      {isEditing && (
        <div className="mb-4">
          <textarea
            className="w-full h-24 p-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundColor: "#ffffff",
              borderColor: "#d1d5db",
              color: "#111827",
            }}
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
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#e5e7eb", color: "#374151" }}
              onClick={() => setIsEditing(false)}
              disabled={disabled}
            >
              取消
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
              onClick={handleEditSubmit}
              disabled={disabled || !feedback.trim()}
            >
              提交修改意见
            </button>
          </>
        ) : (
          <>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#fee2e2", color: "#b91c1c" }}
              onClick={onReject}
              disabled={disabled}
            >
              打回重做
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: "#fef9c3",
                color: "#854d0e",
                border: "1px solid #facc15",
              }}
              onClick={() => setIsEditing(true)}
              disabled={disabled}
            >
              提出修改意见
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{ backgroundColor: "#16a34a", color: "#ffffff" }}
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
