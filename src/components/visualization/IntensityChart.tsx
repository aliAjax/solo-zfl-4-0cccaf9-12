import { useMemo } from 'react';
import type { SmellMemory } from '../../utils/constants';
import { getIntensityDistribution } from '../../utils/helpers';

interface Props {
  memories: SmellMemory[];
}

export default function IntensityChart({ memories }: Props) {
  const data = useMemo(() => getIntensityDistribution(memories), [memories]);
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const total = memories.length;

  return (
    <div className="bg-paper-50/80 backdrop-blur rounded-2xl border border-paper-300 p-5 shadow-paper">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-hand text-xl text-ochre-600">强度分布</h4>
        <span className="text-xs text-ink-700/60">共 {total} 条</span>
      </div>
      <div className="flex items-end justify-between gap-2 h-36">
        {data.map((d) => {
          const heightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          const barHeight = Math.max(heightPct, d.count > 0 ? 8 : 2);
          const gradient = `linear-gradient(180deg, #B8894F 0%, #8B5A2B 50%, #734823 100%)`;
          return (
            <div key={d.bucket} className="flex-1 flex flex-col items-center gap-2">
              <div className="relative w-full flex justify-center items-end h-28">
                <div
                  className="w-full max-w-[36px] rounded-t-lg transition-all duration-700 ease-out relative overflow-hidden"
                  style={{ height: `${barHeight}%`, background: gradient, minHeight: d.count > 0 ? '8px' : '3px' }}
                >
                  <div className="absolute inset-0 opacity-30"
                    style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.08) 100%)' }} />
                </div>
                {d.count > 0 && (
                  <span className="absolute -top-5 text-xs font-semibold text-ochre-600">{d.count}</span>
                )}
              </div>
              <span className="text-[11px] text-ink-700/70 font-medium">{d.bucket}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-ink-700/50 text-center">← 淡 —— 浓 →</div>
    </div>
  );
}
