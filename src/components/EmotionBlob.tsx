"use client";

import { useEffect, useRef } from "react";
import type { EmotionProbs } from "@/lib/types";
import { EMOTION_COLOR, EMOTION_LABEL, EMOTION_EMOJI, dominant } from "@/lib/emotion";

// Watercolor-style emotion blob: 4 colored discs that grow with their
// probability and bleed into each other. Pure SVG + CSS — no WebGL, no math
// degree to read. Decoherence makes the edges quiver.

const POSITIONS: Record<keyof EmotionProbs, { x: number; y: number }> = {
  joy: { x: 50, y: 22 },
  calm: { x: 78, y: 50 },
  anxiety: { x: 50, y: 78 },
  confusion: { x: 22, y: 50 },
};

export function EmotionBlob({
  probs,
  decoherence,
  size = 220,
}: {
  probs: EmotionProbs;
  decoherence: number;
  size?: number;
}) {
  const dom = dominant(probs);
  const wobble = decoherence > 60;
  const filterId = useRef(`blob-${Math.random().toString(36).slice(2, 8)}`).current;

  return (
    <div
      className={`relative ${wobble ? "animate-wobble" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <filter id={filterId}>
            {/* Watercolor blur + slight turbulence so the blob feels organic */}
            <feGaussianBlur stdDeviation="3.5" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 18 -7"
            />
          </filter>
          <radialGradient id={`${filterId}-fade`}>
            <stop offset="0%" stopColor="#F8F6F0" stopOpacity="0" />
            <stop offset="80%" stopColor="#F8F6F0" stopOpacity="0" />
            <stop offset="100%" stopColor="#F8F6F0" stopOpacity="1" />
          </radialGradient>
        </defs>

        <g filter={`url(#${filterId})`}>
          {(Object.keys(POSITIONS) as Array<keyof EmotionProbs>).map((e) => {
            const p = probs[e];
            const pos = POSITIONS[e];
            // radius scales 6 → 32 across [0,1]; min 6 keeps a faint trace
            const r = 6 + p * 26;
            return (
              <circle
                key={e}
                cx={pos.x}
                cy={pos.y}
                r={r}
                fill={EMOTION_COLOR[e]}
                opacity={0.62 + p * 0.3}
                style={{
                  transition: "r 800ms cubic-bezier(.4,.2,.2,1), cx 800ms, cy 800ms, opacity 800ms",
                }}
              />
            );
          })}
        </g>

        {/* outer ring fade — softens edges into the page */}
        <circle cx="50" cy="50" r="50" fill={`url(#${filterId}-fade)`} />
      </svg>

      {/* dominant label */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center">
          <div className="text-3xl">{EMOTION_EMOJI[dom]}</div>
          <div className="text-xs font-mincho text-ink mt-0.5 drop-shadow-sm">
            {EMOTION_LABEL[dom]}
          </div>
        </div>
      </div>
    </div>
  );
}
