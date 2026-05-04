"use client";

export function DecoherenceMeter({ value }: { value: number }) {
  const pct = Math.round(value);
  const high = pct >= 60;
  const critical = pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="label-en text-xs">Decoherence</span>
        <span className={`mono text-xs ${high ? "text-purple" : "text-ink-soft"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-line/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${pct}%`,
            background: high ? "#7B5BAB" : "#C9A548",
          }}
        />
      </div>
      {high && (
        <p className={`mt-2 text-xs ${critical ? "text-purple" : "text-ink-soft"} font-mincho`}>
          {critical
            ? "観測するか、録り直してみて。"
            : "状態が崩れかけています…"}
        </p>
      )}
    </div>
  );
}
