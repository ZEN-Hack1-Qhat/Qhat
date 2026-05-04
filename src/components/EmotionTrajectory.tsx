"use client";

import type { EmotionProbs } from "@/lib/types";
import { EMOTIONS, EMOTION_COLOR, EMOTION_LABEL } from "@/lib/emotion";

export function EmotionTrajectory({ history }: { history: EmotionProbs[] }) {
  const w = 600;
  const h = 200;
  const n = history.length;
  if (n === 0) {
    return (
      <p className="text-sm text-ink-pale font-mincho">
        会話のターンがまだありません。
      </p>
    );
  }
  // build stacked area coordinates
  const xs = history.map((_, i) => (n === 1 ? w / 2 : (i / (n - 1)) * w));
  const orderedEmotions = EMOTIONS;
  const cum: number[][] = history.map(() => [0, 0, 0, 0, 0]);
  history.forEach((p, i) => {
    let acc = 0;
    orderedEmotions.forEach((e, j) => {
      cum[i][j] = acc;
      acc += p[e];
      cum[i][j + 1] = acc;
    });
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {orderedEmotions.map((e, j) => {
        const top = xs.map((x, i) => `${x},${(1 - cum[i][j + 1]) * h}`);
        const bot = xs
          .slice()
          .reverse()
          .map((x, i) => {
            const idx = xs.length - 1 - i;
            return `${x},${(1 - cum[idx][j]) * h}`;
          });
        const d = `M ${top.join(" L ")} L ${bot.join(" L ")} Z`;
        return (
          <path
            key={e}
            d={d}
            fill={EMOTION_COLOR[e]}
            opacity={0.7}
          />
        );
      })}
      {/* legend */}
      <g>
        {orderedEmotions.map((e, idx) => (
          <g key={e} transform={`translate(${idx * 80 + 8}, ${h - 14})`}>
            <rect width={10} height={10} fill={EMOTION_COLOR[e]} opacity={0.7} />
            <text
              x={14}
              y={9}
              fontSize={10}
              fill="#5A5A5A"
              fontFamily="serif"
            >
              {EMOTION_LABEL[e]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
