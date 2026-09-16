import { useMemo } from 'react';
import type { SmellMemory } from '../../utils/constants';
import { getSmellTypeInfo } from '../../utils/constants';

interface Props {
  memories: SmellMemory[];
}

export default function HumidityScatter({ memories }: Props) {
  const points = useMemo(() => {
    return memories.map((m) => {
      const typeInfo = getSmellTypeInfo(m.smell_type);
      return {
        id: m.id,
        x: m.humidity,
        y: m.intensity,
        color: typeInfo.color,
        location: m.location,
        intensity: m.intensity,
        humidity: m.humidity,
      };
    });
  }, [memories]);

  const width = 280;
  const height = 180;
  const padL = 28;
  const padB = 24;
  const padT = 12;
  const padR = 12;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const toX = (v: number) => padL + ((v - 1) / 9) * plotW;
  const toY = (v: number) => padT + plotH - ((v - 1) / 9) * plotH;

  return (
    <div className="bg-paper-50/80 backdrop-blur rounded-2xl border border-paper-300 p-5 shadow-paper">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-hand text-xl text-ochre-600">湿度 × 强度</h4>
        <span className="text-xs text-ink-700/60">{memories.length} 点</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {[1, 3, 5, 7, 10].map((h) => (
          <g key={`gv-${h}`}>
            <line
              x1={toX(h)}
              y1={padT}
              x2={toX(h)}
              y2={padT + plotH}
              stroke="#E0D1B3"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
            <text
              x={toX(h)}
              y={padT + plotH + 14}
              fontSize="9"
              fill="#8B5A2B"
              textAnchor="middle"
              className="font-sans"
            >
              {h === 1 ? '干' : h === 10 ? '湿' : h}
            </text>
          </g>
        ))}
        {[1, 5, 10].map((i) => (
          <g key={`gh-${i}`}>
            <line
              x1={padL}
              y1={toY(i)}
              x2={padL + plotW}
              y2={toY(i)}
              stroke="#E0D1B3"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
            <text
              x={padL - 6}
              y={toY(i) + 3}
              fontSize="9"
              fill="#8B5A2B"
              textAnchor="end"
              className="font-sans"
            >
              {i}
            </text>
          </g>
        ))}
        <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#CBB993" strokeWidth="1.5" />
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#CBB993" strokeWidth="1.5" />
        {points.map((p) => (
          <g key={p.id} className="group">
            <circle
              cx={toX(p.x)}
              cy={toY(p.y)}
              r={5 + p.intensity * 0.4}
              fill={p.color}
              fillOpacity="0.85"
              stroke="#FBF7EE"
              strokeWidth="1.5"
              className="transition-all duration-300 hover:r-[12px]"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(92,58,29,0.2))' }}
            />
            <title>{`${p.location}\n强度 ${p.intensity} / 湿度 ${p.humidity}`}</title>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-700/50 mt-1 px-7">
        <span>湿度感</span>
        <span className="rotate-[-90deg] origin-right translate-y-[-20px]">强度</span>
      </div>
    </div>
  );
}
