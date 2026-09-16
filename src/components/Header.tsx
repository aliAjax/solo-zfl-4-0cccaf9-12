import { Plus } from 'lucide-react';

interface Props {
  onAdd: () => void;
  memoryCount: number;
}

export default function Header({ onAdd, memoryCount }: Props) {
  return (
    <header className="relative pt-14 pb-8 md:pt-20 md:pb-12">
      <div className="container max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="relative">
            <div className="absolute -left-2 -top-8 text-7xl md:text-8xl opacity-10 select-none pointer-events-none font-serif text-ochre-500">
              味
            </div>
            <h1 className="font-serif text-4xl md:text-6xl font-bold text-ink-800 leading-tight relative z-10">
              旧房间
              <span className="text-ochre-500">气味</span>
              记忆库
            </h1>
            <p className="mt-3 font-hand text-lg md:text-xl text-ink-700/70 pl-1 relative z-10">
              封存每一缕难以忘怀的空气，把嗅觉变成可以翻阅的回忆
            </p>
            <div className="mt-4 flex items-center gap-4 pl-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-paper-200/80 text-ink-700/80 text-sm border border-paper-300">
                <span className="text-base">📚</span>
                已封存 <b className="text-ochre-600 font-semibold">{memoryCount}</b> 段气味
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-moss-100 text-moss-600 text-sm border border-moss-200">
                <span className="text-base">🌿</span>
                仅你可见
              </span>
            </div>
          </div>
          <button
            onClick={onAdd}
            className="group relative inline-flex items-center justify-center gap-2 bg-ochre-500 hover:bg-ochre-600 active:bg-ochre-700 text-paper-50 font-medium rounded-2xl px-6 py-3.5 shadow-paper hover:shadow-paper-hover hover:-translate-y-1 transition-all duration-250 self-start md:self-auto"
          >
            <span className="absolute inset-0 rounded-2xl opacity-20"
              style={{ background: 'radial-gradient(circle at 20% 20%, #fff 0%, transparent 60%)' }} />
            <Plus className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.5} />
            <span className="font-serif text-lg">封存一段气味</span>
          </button>
        </div>
        <div className="mt-8 h-px w-full" style={{ background: 'linear-gradient(90deg, transparent 0%, #CBB993 20%, #CBB993 80%, transparent 100%)' }} />
      </div>
    </header>
  );
}
