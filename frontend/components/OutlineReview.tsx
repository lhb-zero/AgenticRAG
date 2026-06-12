// 大纲审核组件 - HITL: 编辑/批准/拒绝大纲

"use client";

import React, { useState } from "react";

interface Props {
  outline: string;
  onApprove: () => void;
  onEdit: (editedOutline: string) => void;
  onReject: () => void;
  disabled?: boolean;
}

export default function OutlineReview({
  outline,
  onApprove,
  onEdit,
  onReject,
  disabled = false,
}: Props) {
  const [editedOutline, setEditedOutline] = useState(outline);
  const [isEditing, setIsEditing] = useState(false);

  const handleEditSubmit = () => {
    onEdit(editedOutline);
    setIsEditing(false);
  };

  return (
    <div
      className="rounded-xl p-5 my-3 border"
      style={{
        backgroundColor: "#fef9c3", // yellow-100
        borderColor: "#facc15", // yellow-400
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold" style={{ color: "#854d0e" }}>
          大纲审核
        </h3>
        <span
          className="text-xs px-2 py-1 rounded-full"
          style={{ backgroundColor: "#fde047", color: "#854d0e" }}
        >
          等待确认
        </span>
      </div>

      {isEditing ? (
        <textarea
          className="w-full h-64 p-3 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#d1d5db",
            color: "#111827",
          }}
          value={editedOutline}
          onChange={(e) => setEditedOutline(e.target.value)}
        />
      ) : (
        <div
          className="mb-4 p-3 rounded-lg border"
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#e5e7eb",
          }}
        >
          <pre
            className="whitespace-pre-wrap font-sans text-sm m-0"
            style={{ color: "#1f2937" }}
          >
            {outline}
          </pre>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        {isEditing ? (
          <>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: "#e5e7eb",
                color: "#374151",
              }}
              onClick={() => {
                setEditedOutline(outline);
                setIsEditing(false);
              }}
              disabled={disabled}
            >
              取消
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: "#2563eb",
                color: "#ffffff",
              }}
              onClick={handleEditSubmit}
              disabled={disabled}
            >
              提交修改
            </button>
          </>
        ) : (
          <>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: "#fee2e2",
                color: "#b91c1c",
              }}
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
              编辑大纲
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg disabled:opacity-50"
              style={{
                backgroundColor: "#16a34a",
                color: "#ffffff",
              }}
              onClick={onApprove}
              disabled={disabled}
            >
              确认并继续
            </button>
          </>
        )}
      </div>
    </div>
  );
}
