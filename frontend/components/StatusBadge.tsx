"use client";

import { AppPhase } from "@/lib/types";

const PHASE_CONFIG: Record<
  AppPhase,
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: "就绪", color: "bg-slate-400", pulse: false },
  researching: { label: "检索中", color: "bg-blue-500", pulse: true },
  outline_review: { label: "大纲审核", color: "bg-yellow-500", pulse: true },
  generating: { label: "生成中", color: "bg-indigo-500", pulse: true },
  answer_review: { label: "答案审核", color: "bg-green-500", pulse: true },
  done: { label: "完成", color: "bg-green-500", pulse: false },
  error: { label: "出错", color: "bg-red-500", pulse: false },
};

interface StatusBadgeProps {
  phase: AppPhase;
}

export default function StatusBadge({ phase }: StatusBadgeProps) {
  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG.idle;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.color} opacity-60`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.color}`} />
      </span>
      {config.label}
    </span>
  );
}
