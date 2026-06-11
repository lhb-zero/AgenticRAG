"use client";

interface WelcomeScreenProps {
  onQuickAsk: (question: string) => void;
}

const QUICK_PROMPTS = [
  {
    icon: "📄",
    title: "文档检索",
    desc: "如何上传和管理知识库文档？",
    query: "如何上传和管理知识库文档？",
  },
  {
    icon: "🔍",
    title: "智能检索",
    desc: "系统是如何进行自我纠错检索的？",
    query: "系统是如何进行自我纠错检索的？",
  },
  {
    icon: "✅",
    title: "人工审核",
    desc: "HITL 人工审核流程是如何工作的？",
    query: "HITL 人工审核流程是如何工作的？",
  },
  {
    icon: "⚙️",
    title: "系统架构",
    desc: "介绍一下整个系统的技术架构和数据流",
    query: "介绍一下整个系统的技术架构和数据流",
  },
];

export default function WelcomeScreen({ onQuickAsk }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      {/* Logo & 标题 */}
      <div className="flex flex-col items-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600
          flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
          Agentic RAG 知识库
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md">
          企业级智能问答系统，具备自我纠错检索和人机协作审核能力
        </p>
      </div>

      {/* 快捷提问卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {QUICK_PROMPTS.map((item) => (
          <button
            key={item.title}
            onClick={() => onQuickAsk(item.query)}
            className="flex items-start gap-3 p-4 rounded-xl border border-slate-200
              dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600
              hover:bg-blue-50/50 dark:hover:bg-blue-900/10
              text-left transition-all group"
          >
            <span className="text-xl mt-0.5">{item.icon}</span>
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200
                group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {item.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
