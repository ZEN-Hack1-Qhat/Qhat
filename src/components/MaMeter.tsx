"use client";

import { useEffect, useState } from "react";

// Visualises the silence ("間") between turns. The whole point of Qhat is
// practising the gap, so this is the primary feedback signal.
//
// Bands:
//   0.0 – 3.0s  : 自然な間   (calm green)
//   3.0 – 7.0s  : 考える間   (gold)
//   7.0 – ∞s    : 気まずい間 (purple, vibrating)
//
// Scale is non-linear so 0–7s occupies most of the bar.

const NATURAL_S = 3;
const THOUGHTFUL_S = 7;
const FULL_S = 14;

function widthPct(seconds: number) {
  if (seconds <= NATURAL_S) return (seconds / NATURAL_S) * 33;
  if (seconds <= THOUGHTFUL_S)
    return 33 + ((seconds - NATURAL_S) / (THOUGHTFUL_S - NATURAL_S)) * 34;
  return Math.min(
    100,
    67 + ((seconds - THOUGHTFUL_S) / (FULL_S - THOUGHTFUL_S)) * 33
  );
}

interface Props {
  // wall-clock time of the last user/character interaction (ms)
  lastInteractionAt: number;
  // when actively speaking/recording, the meter is "paused" at 0
  paused: boolean;
}

export function MaMeter({ lastInteractionAt, paused }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [paused]);

  const seconds = paused ? 0 : Math.max(0, (now - lastInteractionAt) / 1000);
  const pct = widthPct(seconds);

  let label = "自然な間";
  let color = "#5B8C7A";
  let bgClass = "";
  if (seconds > THOUGHTFUL_S) {
    label = "気まずい間";
    color = "#7B5BAB";
    bgClass = "animate-pulse";
  } else if (seconds > NATURAL_S) {
    label = "考える間";
    color = "#C9A548";
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="label-en text-[10px]">Pause</span>
        <span
          className="text-xs font-mincho"
          style={{ color: paused ? "#A09C92" : color }}
        >
          {paused ? "—" : `${seconds.toFixed(1)}s ・ ${label}`}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-line/40 overflow-hidden">
        {/* zone markers */}
        <div
          className="absolute top-0 bottom-0 border-r border-line/70"
          style={{ left: `${widthPct(NATURAL_S)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 border-r border-line/70"
          style={{ left: `${widthPct(THOUGHTFUL_S)}%` }}
        />
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${bgClass}`}
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-ink-pale mt-1 font-mincho">
        <span>自然</span>
        <span>考える</span>
        <span>気まずい</span>
      </div>
    </div>
  );
}
