"use client";

import type { EmotionProbs } from "@/lib/types";
import { EMOTIONS, EMOTION_LABEL, EMOTION_COLOR, dominant } from "@/lib/emotion";

export function EmotionBars({ probs }: { probs: EmotionProbs }) {
  const dom = dominant(probs);
  return (
    <div className="space-y-2">
      {EMOTIONS.map((e) => {
        const v = probs[e];
        const isDom = e === dom;
        return (
          <div key={e} className="flex items-center gap-3">
            <span
              className={`w-10 text-xs font-mincho ${isDom ? "text-ink" : "text-ink-pale"}`}
            >
              {EMOTION_LABEL[e]}
            </span>
            <div className="flex-1 h-2 rounded-full bg-line/50 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${(v * 100).toFixed(0)}%`,
                  background: isDom ? EMOTION_COLOR[e] : "#D8D5CD",
                  opacity: isDom ? 1 : 0.6,
                }}
              />
            </div>
            <span
              className={`mono text-xs w-10 text-right ${isDom ? "text-ink" : "text-ink-pale"}`}
            >
              {(v * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
