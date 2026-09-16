import { useMemo } from 'react';
import type { SmellMemory } from '../../utils/constants';
import { getTopIntensityMemories, contrastTextColor } from '../../utils/helpers';
import { getSeasonInfo, getSmellTypeInfo } from '../../utils/constants';

interface Props {
  memories: SmellMemory[];
  onSelect?: (id: string) => void;
}

export default function TopList({ memories, onSelect }: Props) {
  const top5 = useMemo(() => getTopIntensityMemories(memories, 5), [memories]);

  return (
    <div className="bg-paper-50/80 backdrop-blur rounded-2xl border border-paper-300 p-5 shadow-paper">
      <h4 className="font-hand text-xl text-ochre-600 mb-4 flex items-center gap-2">
        <span>Top 5</span>
        <span className="text-sm">最强气味</span>
      </h4>
      <div className="space-y-2.5">
        {top5.length === 0 ? (
          <div className="text-center py-8 text-ink-700/40 text-sm">暂无记忆记录</div>
        ) : (
          top5.map((m, idx) => {
            const season = getSeasonInfo(m.season);
            const stype = getSmellTypeInfo(m.smell_type);
            return (
              <button
                key={m.id}
                onClick={() => onSelect?.(m.id)}
                className="w-full group flex items-center gap-3 p-2.5 rounded-xl bg-paper-100/60 hover:bg-paper-200/80 transition-all duration-200 text-left"
              >
                <div
                  className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-lg font-bold shadow-sm"
                  style={{
                    background: m.color_association,
                    color: contrastTextColor(m.color_association),
                  }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">{season.emoji}</span>
                    <span className="text-base">{stype.emoji}</span>
                    <span className="text-sm font-medium text-ink-800 truncate">{m.location}</span>
                  </div>
                  <div className="text-[11px] text-ink-700/60 truncate">{m.source_guess}</div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-xl font-serif font-bold text-ochre-600 leading-none">
                    {m.intensity}
                  </div>
                  <div className="text-[10px] text-ink-700/50">/ 10</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
