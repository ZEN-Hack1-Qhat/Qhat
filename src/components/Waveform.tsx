"use client";

import { useEffect, useRef } from "react";

export function Waveform({
  level,
  silent,
  active,
}: {
  level: number;
  silent: boolean;
  active: boolean;
}) {
  const bars = 40;
  const histRef = useRef<number[]>(Array(bars).fill(0));

  useEffect(() => {
    histRef.current = [...histRef.current.slice(1), Math.min(1, level * 4)];
  }, [level]);

  return (
    <div className="flex items-end gap-[2px] h-8">
      {Array.from({ length: bars }).map((_, i) => {
        const v = histRef.current[i] ?? 0;
        const h = active ? Math.max(2, v * 32) : 2;
        return (
          <div
            key={i}
            className="w-1 rounded-sm transition-all"
            style={{
              height: `${h}px`,
              background: silent ? "#7B5BAB" : active ? "#C9A548" : "#D8D5CD",
              opacity: active ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}
