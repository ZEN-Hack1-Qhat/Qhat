"use client";

import type { EmotionProbs } from "@/lib/types";
import {
  EMOTION_EMOJI,
  EMOTION_LABEL,
  dominant,
  entropy,
  entropyLabel,
} from "@/lib/emotion";

export function ReceptionPanel({
  prev,
  curr,
  summary,
}: {
  prev: EmotionProbs;
  curr: EmotionProbs;
  summary?: string;
}) {
  const prevDom = dominant(prev);
  const currDom = dominant(curr);
  const h = entropy(curr);
  const changed = prevDom !== currDom;
  return (
    <div className="rounded-md border border-line bg-paper/50 p-4">
      <p className="label-en text-xs mb-3">Reception</p>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ink-pale">ドミナント</span>
        <span className="font-mincho text-base">
          {EMOTION_LABEL[currDom]} {EMOTION_EMOJI[currDom]}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ink-pale">エントロピー</span>
        <div className="text-right">
          <span className="mono text-sm">{h.toFixed(2)} bits</span>
          <p className="text-[10px] text-ink-pale font-mincho">
            （{entropyLabel(h)}）
          </p>
        </div>
      </div>

      {changed && (
        <div className="rounded border border-gold-soft bg-gold-soft/30 px-3 py-2 mb-3">
          <p className="text-xs font-mincho text-ink-soft">
            前回比: {EMOTION_LABEL[prevDom]} → {EMOTION_LABEL[currDom]}
          </p>
        </div>
      )}

      {summary && (
        <div className="rounded border border-line bg-white px-3 py-2 mb-3">
          <p className="text-sm font-mincho">{summary}</p>
        </div>
      )}

      <p className="text-[10px] text-ink-pale font-mincho leading-relaxed">
        ∞ 会話が続くほど、相手の心の状態がわかってくる。
      </p>
    </div>
  );
}
