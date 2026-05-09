"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { EmotionTrajectory } from "@/components/EmotionTrajectory";
import { dominant, EMOTION_COLOR, EMOTION_LABEL, EMOTIONS } from "@/lib/emotion";
import type { EmotionProbs } from "@/lib/types";
import { loadSessions, type SavedSession } from "@/lib/sessionStore";

interface Aggregate {
  totalSessions: number;
  totalTurns: number;
  averageTurns: number;
  dominantCounts: Record<string, number>;
  latestTrajectory: EmotionProbs[];
}

function aggregate(sessions: SavedSession[]): Aggregate {
  let totalTurns = 0;
  const dominantCounts: Record<string, number> = {
    joy: 0,
    calm: 0,
    anxiety: 0,
    confusion: 0,
  };
  for (const s of sessions) {
    const userTurns = s.messages.filter((m) => m.role === "user").length;
    totalTurns += userTurns;
    for (const m of s.messages) {
      if (m.role !== "character" || !m.emotion) continue;
      const d = dominant(m.emotion);
      dominantCounts[d] = (dominantCounts[d] ?? 0) + 1;
    }
  }
  const latest = sessions[0];
  const latestTrajectory: EmotionProbs[] = latest
    ? latest.messages
        .filter((m) => m.role === "character" && !!m.emotion)
        .map((m) => m.emotion!)
    : [];
  return {
    totalSessions: sessions.length,
    totalTurns,
    averageTurns:
      sessions.length === 0 ? 0 : Math.round(totalTurns / sessions.length),
    dominantCounts,
    latestTrajectory,
  };
}

export default function AnalysisPage() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSessions(loadSessions());
    setLoaded(true);
  }, []);

  const agg = useMemo(() => aggregate(sessions), [sessions]);
  const dominantTotal = Object.values(agg.dominantCounts).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <main className="min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] py-6">
        <header>
          <h1 className="text-[22px] font-extrabold">分析</h1>
          <p className="mt-1 text-[12px] font-bold text-[#8a8178]">
            あなたの練習データから、相手の感情がどう動いたかを集計します。
          </p>
        </header>

        {loaded && sessions.length === 0 ? (
          <section className="rounded-[24px] border border-black/5 bg-white/85 p-6 text-center">
            <p className="mb-2 text-[15px] font-bold text-[#49433d]">
              分析できるデータがまだありません
            </p>
            <p className="text-[12px] leading-relaxed text-[#8a8178]">
              プロフィールで保存をオンにして練習を続けると、ここに統計が出ます。
            </p>
            <Link
              href="/profile"
              className="mt-4 inline-block rounded-full bg-[#f4be42] px-5 py-2 text-[13px] font-extrabold text-[#2a241d]"
            >
              プロフィールへ
            </Link>
          </section>
        ) : loaded ? (
          <>
            <section className="grid grid-cols-3 gap-2">
              <Stat label="セッション" value={`${agg.totalSessions}`} />
              <Stat label="総ターン数" value={`${agg.totalTurns}`} />
              <Stat label="平均ターン" value={`${agg.averageTurns}`} />
            </section>

            <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
              <h2 className="mb-3 text-[13px] font-extrabold text-[#49433d]">
                相手の支配感情（全セッション合計）
              </h2>
              <div className="space-y-2">
                {EMOTIONS.map((e) => {
                  const count = agg.dominantCounts[e] ?? 0;
                  const pct =
                    dominantTotal === 0
                      ? 0
                      : Math.round((count / dominantTotal) * 100);
                  return (
                    <div key={e}>
                      <div className="mb-1 flex items-center justify-between text-[12px] font-extrabold">
                        <span style={{ color: EMOTION_COLOR[e] }}>
                          {EMOTION_LABEL[e]}
                        </span>
                        <span className="text-[#5f5a53]">
                          {count}回 ・ {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: EMOTION_COLOR[e],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {agg.latestTrajectory.length > 0 && (
              <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
                <h2 className="mb-2 text-[13px] font-extrabold text-[#49433d]">
                  直近セッションの感情推移
                </h2>
                <EmotionTrajectory history={agg.latestTrajectory} />
                <p className="mt-2 text-[11px] font-bold text-[#8a8178]">
                  縦軸は4感情の確率（合計100%）。横軸はターン進行。
                </p>
              </section>
            )}
          </>
        ) : (
          <p className="text-center text-[12px] text-[#8a8178]">読み込み中…</p>
        )}

        <BottomNav />
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-black/5 bg-white/85 p-3 text-center shadow-sm">
      <p className="text-[10px] font-bold text-[#8a8178]">{label}</p>
      <p className="mt-1 text-[20px] font-extrabold text-[#49433d]">{value}</p>
    </div>
  );
}
