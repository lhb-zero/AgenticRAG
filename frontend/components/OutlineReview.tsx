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
    <div className="border border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-5 my-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">
          大纲审核
        </h3>
        <span className="text-xs px-2 py-1 bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-full">
          等待确认
        </span>
      </div>

      {isEditing ? (
        <textarea
          className="w-full h-64 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={editedOutline}
          onChange={(e) => setEditedOutline(e.target.value)}
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-300">
            {outline}
          </pre>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        {isEditing ? (
          <>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              onClick={() => {
                setEditedOutline(outline);
                setIsEditing(false);
              }}
              disabled={disabled}
            >
              取消
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleEditSubmit}
              disabled={disabled}
            >
              提交修改
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
              编辑大纲
            </button>
            <button
              className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
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