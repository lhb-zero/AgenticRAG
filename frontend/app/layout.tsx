// 全局布局 - 导航栏 / 侧边栏 / Provider 注入

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Agentic RAG - 企业知识库问答系统",
  description: "具备自我纠错检索和多节点人机交互（HITL）能力的企业级知识库系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  );
}