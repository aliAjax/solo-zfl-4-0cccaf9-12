import { useMemo } from 'react';
import type { SmellMemory } from '../../utils/constants';
import { getAverageIntensity } from '../../utils/helpers';

interface Props {
  memories: SmellMemory[];
}

export default function AvgGauge({ memories }: Props) {
  const avg = useMemo(() => getAverageIntensity(memories), [memories]);
  const pct = Math.min(avg / 10, 1) * 100;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference * 0.75;

  const getLabel = (v: number) => {
    if (v === 0) return '无记录';
    if (v < 3) return '幽香';
    if (v < 5) return '清淡';
    if (v < 7) return '适中';
    if (v < 9) return '浓郁';
    return '强烈';
  };

  return (
    <div className="bg-paper-50/80 backdrop-blur rounded-2xl border border-paper-300 p-5 shadow-paper flex flex-col items-center">
      <h4 className="font-hand text-xl text-ochre-600 self-start mb-2">平均强度</h4>
      <div className="relative w-full flex justify-center">
        <svg viewBox="0 0 160 140" className="w-56 h-48">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#CFDBD3" />
              <stop offset="40%" stopColor="#D4B487" />
              <stop offset="75%" stopColor="#8B5A2B" />
              <stop offset="100%" stopColor="#5C3A1D" />
            </linearGradient>
          </defs>
          <path
            d="M 22 120 A 66 66 0 1 1 138 120"
            fill="none"
            stroke="#E0D1B3"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M 22 120 A 66 66 0 1 1 138 120"
            fill="none"
            stroke="url(#gaugeGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference * 0.75}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
          {[0, 25, 50, 75, 100].map((t) => {
            const angle = -135 + (t / 100) * 270;
            const rad = (angle * Math.PI) / 180;
            const x1 = 80 + Math.cos(rad) * 48;
            const y1 = 120 + Math.sin(rad) * 48;
            const x2 = 80 + Math.cos(rad) * 54;
            const y2 = 120 + Math.sin(rad) * 54;
            return (
              <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#CBB993" strokeWidth="1.5" />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col justify-end items-center pb-8">
          <span className="text-4xl font-serif font-bold text-ochre-600 leading-none">
            {avg.toFixed(1)}
          </span>
          <span className="text-xs text-ink-700/60 mt-1">/ 10</span>
        </div>
      </div>
      <div className="mt-2 px-4 py-1.5 rounded-full bg-ochre-100 text-ochre-600 text-sm font-medium">
        {getLabel(avg)}
      </div>
    </div>
  );
}
