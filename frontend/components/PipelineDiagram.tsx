// 流程图组件 - 纯 SVG 可视化 LangGraph 执行流程

"use client";

import React from "react";

interface Props {
  activeNode?: string;
  completedNodes?: string[];
}

const NODES = [
  { id: "research", label: "研究检索", x: 50, y: 80, w: 120, h: 40 },
  { id: "generate_outline", label: "生成大纲", x: 230, y: 80, w: 120, h: 40 },
  { id: "generate_draft", label: "生成草稿", x: 410, y: 80, w: 120, h: 40 },
  { id: "finalize", label: "最终输出", x: 590, y: 80, w: 120, h: 40 },
];

const SUB_NODES = [
  { id: "plan", label: "规划查询", x: 20, y: 170, w: 90, h: 32 },
  { id: "retrieve", label: "向量检索", x: 130, y: 170, w: 90, h: 32 },
  { id: "grade", label: "文档打分", x: 240, y: 170, w: 90, h: 32 },
  { id: "rewrite", label: "查询改写", x: 185, y: 220, w: 90, h: 32 },
];

const HITL_POINTS = [
  { x: 350, y: 60, label: "HITL" },
  { x: 530, y: 60, label: "HITL" },
];

export default function PipelineDiagram({ activeNode, completedNodes = [] }: Props) {
  const getNodeStyle = (nodeId: string) => {
    if (activeNode === nodeId) {
      return {
        fill: "#3b82f6",
        stroke: "#1d4ed8",
        textColor: "#ffffff",
        pulse: true,
      };
    }
    if (completedNodes.includes(nodeId)) {
      return {
        fill: "#22c55e",
        stroke: "#16a34a",
        textColor: "#ffffff",
        pulse: false,
      };
    }
    return {
      fill: "#f3f4f6",
      stroke: "#d1d5db",
      textColor: "#374151",
      pulse: false,
    };
  };

  const getSubNodeStyle = (nodeId: string) => {
    // 子节点跟随父节点 research 的状态
    if (activeNode === "research" || completedNodes.includes("research")) {
      if (activeNode === "research") {
        return { fill: "#93c5fd", stroke: "#3b82f6", textColor: "#1e3a5f" };
      }
      return { fill: "#86efac", stroke: "#22c55e", textColor: "#14532d" };
    }
    return { fill: "#f9fafb", stroke: "#e5e7eb", textColor: "#6b7280" };
  };

  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 760 270" className="w-full max-w-3xl mx-auto">
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#9ca3af" />
          </marker>
          <marker
            id="arrowhead-active"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
          </marker>
          {/* 脉冲动画 */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 连接线 - 主流程 */}
        {/* research → generate_outline */}
        <line
          x1={170}
          y1={100}
          x2={230}
          y2={100}
          stroke={completedNodes.includes("research") ? "#22c55e" : "#d1d5db"}
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
        />
        {/* generate_outline → generate_draft */}
        <line
          x1={350}
          y1={100}
          x2={410}
          y2={100}
          stroke={completedNodes.includes("generate_outline") ? "#22c55e" : "#d1d5db"}
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
        />
        {/* generate_draft → finalize */}
        <line
          x1={530}
          y1={100}
          x2={590}
          y2={100}
          stroke={completedNodes.includes("generate_draft") ? "#22c55e" : "#d1d5db"}
          strokeWidth="2"
          markerEnd="url(#arrowhead)"
        />

        {/* HITL 中断标记 */}
        {HITL_POINTS.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x}
              cy={point.y}
              r="12"
              fill="#fef3c7"
              stroke="#f59e0b"
              strokeWidth="1.5"
            />
            <text
              x={point.x}
              y={point.y + 4}
              textAnchor="middle"
              className="text-[8px] font-bold"
              fill="#92400e"
            >
              {point.label}
            </text>
            {/* 向下的指示线 */}
            <line
              x1={point.x}
              y1={point.y + 12}
              x2={point.x}
              y2={68}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="3,2"
            />
          </g>
        ))}

        {/* 子图区域 */}
        <rect
          x="10"
          y="145"
          width="330"
          height="120"
          rx="8"
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
          strokeDasharray="4,3"
        />
        <text x="20" y="162" className="text-[10px]" fill="#9ca3af">
          Research 子图 (ReAct 循环)
        </text>

        {/* 子图连接线 */}
        <line
          x1={110}
          y1={186}
          x2={130}
          y2={186}
          stroke="#d1d5db"
          strokeWidth="1.5"
          markerEnd="url(#arrowhead)"
        />
        <line
          x1={220}
          y1={186}
          x2={240}
          y2={186}
          stroke="#d1d5db"
          strokeWidth="1.5"
          markerEnd="url(#arrowhead)"
        />
        {/* grade → rewrite (条件边，虚线) */}
        <path
          d="M 285 202 L 285 236 L 230 236"
          fill="none"
          stroke="#d1d5db"
          strokeWidth="1"
          strokeDasharray="3,2"
          markerEnd="url(#arrowhead)"
        />
        {/* rewrite → plan (循环) */}
        <path
          d="M 185 236 L 140 236 L 140 202"
          fill="none"
          stroke="#d1d5db"
          strokeWidth="1"
          strokeDasharray="3,2"
          markerEnd="url(#arrowhead)"
        />
        <text x="250" y="250" className="text-[8px]" fill="#9ca3af">
          最多 2 次改写
        </text>

        {/* 主节点 */}
        {NODES.map((node) => {
          const style = getNodeStyle(node.id);
          return (
            <g key={node.id}>
              {style.pulse && (
                <rect
                  x={node.x - 3}
                  y={node.y - 3}
                  width={node.w + 6}
                  height={node.h + 6}
                  rx={13}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  opacity="0.5"
                  filter="url(#glow)"
                >
                  <animate
                    attributeName="opacity"
                    values="0.5;0.2;0.5"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={10}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth="2"
              />
              <text
                x={node.x + node.w / 2}
                y={node.y + node.h / 2 + 4}
                textAnchor="middle"
                className="text-[11px] font-medium"
                fill={style.textColor}
              >
                {node.label}
              </text>
            </g>
          );
        })}

        {/* 子节点 */}
        {SUB_NODES.map((node) => {
          const style = getSubNodeStyle(node.id);
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={6}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth="1.5"
              />
              <text
                x={node.x + node.w / 2}
                y={node.y + node.h / 2 + 4}
                textAnchor="middle"
                className="text-[9px]"
                fill={style.textColor}
              >
                {node.label}
              </text>
            </g>
          );
        })}

        {/* START 和 END 标记 */}
        <circle cx="25" cy="100" r="12" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.5" />
        <text x="25" y="104" textAnchor="middle" className="text-[8px] font-bold" fill="#6b7280">
          S
        </text>
        <line x1="37" y1="100" x2="50" y2="100" stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#arrowhead)" />

        <circle cx="735" cy="100" r="12" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="1.5" />
        <text x="735" y="104" textAnchor="middle" className="text-[8px] font-bold" fill="#6b7280">
          E
        </text>
        <line x1={710} y1={100} x2={723} y2={100} stroke="#9ca3af" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
      </svg>
    </div>
  );
}
