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
    gradient: "from-blue-500 to-cyan-500",
    shadow: "shadow-blue-500/20",
  },
  {
    icon: "🔍",
    title: "智能检索",
    desc: "系统是如何进行自我纠错检索的？",
    query: "系统是如何进行自我纠错检索的？",
    gradient: "from-violet-500 to-purple-500",
    shadow: "shadow-violet-500/20",
  },
  {
    icon: "✅",
    title: "人工审核",
    desc: "HITL 人工审核流程是如何工作的？",
    query: "HITL 人工审核流程是如何工作的？",
    gradient: "from-emerald-500 to-teal-500",
    shadow: "shadow-emerald-500/20",
  },
  {
    icon: "⚙️",
    title: "系统架构",
    desc: "介绍一下整个系统的技术架构和数据流",
    query: "介绍一下整个系统的技术架构和数据流",
    gradient: "from-amber-500 to-orange-500",
    shadow: "shadow-amber-500/20",
  },
];

export default function WelcomeScreen({ onQuickAsk }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 relative">
      {/* 背景装饰光斑 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-400/10 dark:bg-blue-500/5
          rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-400/10 dark:bg-purple-500/5
          rounded-full blur-3xl animate-float" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-1/3 right-1/3 w-48 h-48 bg-cyan-400/10 dark:bg-cyan-500/5
          rounded-full blur-3xl animate-float" style={{ animationDelay: "3s" }} />
      </div>

      {/* Logo & 标题 */}
      <div className="flex flex-col items-center mb-10 relative z-10">
        <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600
          flex items-center justify-center mb-5 shadow-xl shadow-indigo-500/25
          animate-float">
          <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gradient mb-2">
          Agentic RAG 知识库
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md leading-relaxed">
          企业级智能问答系统<br />
          <span className="text-slate-400 dark:text-slate-500">
            自我纠错检索 · 人机协作审核 · 知识库管理
          </span>
        </p>
      </div>

      {/* 快捷提问卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-2xl relative z-10">
        {QUICK_PROMPTS.map((item, i) => (
          <button
            key={item.title}
            onClick={() => onQuickAsk(item.query)}
            className="flex items-start gap-3.5 p-4 rounded-2xl
              bg-white/60 dark:bg-slate-800/40
              border border-slate-200/60 dark:border-slate-700/40
              hover:border-transparent
              hover:bg-white dark:hover:bg-slate-800/60
              hover:shadow-lg hover:${item.shadow}
              text-left transition-all duration-300 group
              hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className={`shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient}
              flex items-center justify-center text-lg shadow-md ${item.shadow}
              group-hover:scale-110 transition-transform duration-300`}>
              {item.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200
                group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">
                {item.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
