"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { STORY_EPISODES, nextEpisode, type StoryEpisode } from "@/lib/story";
import { getStoryProgress } from "@/lib/sessionStore";

interface StoryViewProps {
  // Called when the user picks an episode to play. The parent (HomePage)
  // is responsible for transitioning to the conversation view; the episode
  // id (not scene id) flows through so we can mark completion afterwards.
  onPickEpisode: (episode: StoryEpisode) => void;
  // Day 30 reflection has no scene; we surface it as its own UI state.
  onOpenReflection: (episode: StoryEpisode) => void;
}

// Phone-first redesign: fits the entire 30-day arc on one viewport without
// scrolling. The hero card on top is the only verbose surface (it's the
// next-up CTA the user needs); everything else collapses to a tight grid
// of day chips so all 11 episodes are visible at a glance.
export function StoryView({ onPickEpisode, onOpenReflection }: StoryViewProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    setCompleted(new Set(getStoryProgress()));
    setLoaded(true);
  }, []);

  const next = useMemo(() => nextEpisode(completed), [completed]);
  const total = STORY_EPISODES.length;
  const done = completed.size;
  // Episode order in the array is the display order. Use the position as the
  // chip label (Day 1..N) instead of episode.day, which jumps (1, 3, 5, 7…)
  // because the underlying story arc has rest days between practice sessions.
  // The chip should read as "session N of total", not "day-in-month".
  const nextIndex = next ? STORY_EPISODES.findIndex((e) => e.id === next.id) : -1;

  const handleStart = () => {
    if (!next) return;
    if (next.kind === "reflection") onOpenReflection(next);
    else onPickEpisode(next);
  };

  return (
    <main className="qhat-fade-in min-h-[100dvh] bg-[#f7f5f1] text-[#2b2b2b]">
      <div
        className="mx-auto flex min-h-[100dvh] max-w-[430px] flex-col gap-3 px-[18px] pt-4"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
        }}
      >
        <header className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Qhat"
            className="h-10 w-10 object-contain"
          />
          <div>
            <h1 className="text-[20px] font-extrabold leading-tight">Qhat</h1>
            <p className="text-[11px] font-bold text-[#8a8178]">
              全{STORY_EPISODES.length}日チャレンジ
            </p>
          </div>
          <span className="ml-auto text-[12px] font-extrabold text-[#5f5a53]">
            {loaded ? `${done} / ${total}` : "…"}
          </span>
          <button
            type="button"
            onClick={() => setShowAbout(true)}
            aria-label="Qhat について"
            // 36px hit target with visible chip — small but reachable on a
            // phone, and intentionally subtle so it doesn't compete with
            // the day-grid CTA.
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-black/10 bg-white/80 text-[15px] font-extrabold text-[#8a8178] active:scale-95"
            style={{
              touchAction: "manipulation",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            ?
          </button>
        </header>

        {/* Progress bar — slim, just orientation. */}
        <div className="h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
          <div
            className="h-full rounded-full bg-[#f4be42] transition-all"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>

        {/* Hero next-up card — the single verbose surface. Tapping starts
            the next undone episode directly so the user doesn't have to
            scan the chip grid to find where they are. */}
        {next ? (
          <button
            onClick={handleStart}
            type="button"
            className="qhat-shimmer group w-full overflow-hidden rounded-[20px] bg-gradient-to-br from-[#ffd86a] to-[#f4a93b] p-[2px] shadow-[0_8px_22px_rgba(244,169,59,0.22)] transition active:scale-[0.99]"
          >
            <div className="rounded-[18px] bg-gradient-to-br from-[#fff5d8] to-[#ffe2a3] px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold text-[#7a5e1f]">
                    NEXT・Day {nextIndex + 1}
                  </p>
                  <p className="truncate text-[16px] font-extrabold text-[#2a241d]">
                    {next.kind === "reflection" ? "🎓 " : "🎤 "}
                    {next.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-bold text-[#7a5e1f]">
                    {next.learningGoal}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="shrink-0 text-[20px] font-extrabold text-[#7a5e1f] transition-transform group-active:translate-x-1"
                >
                  →
                </span>
              </div>
            </div>
          </button>
        ) : (
          <p className="rounded-[18px] border border-black/5 bg-white/85 p-4 text-center text-[13px] font-bold text-[#5f5a53] shadow-sm">
            🎓 全エピソードクリア。Qhat 卒業です。
          </p>
        )}

        <p className="text-[11px] font-bold text-[#8a8178]">タイムライン</p>

        {/* Compact 4-col chip grid — every Day visible without scrolling.
            Each chip is just the day number + a state hint (✓ / NEXT / 🔒).
            Tap to open that episode (locked ones are disabled). */}
        <ul className="grid grid-cols-4 gap-2">
          {STORY_EPISODES.map((ep, i) => {
            const isDone = completed.has(ep.id);
            const isNext = next?.id === ep.id;
            const priorAllDone = STORY_EPISODES.slice(0, i).every((e) =>
              completed.has(e.id)
            );
            const locked = !isDone && !priorAllDone;
            const tap = locked
              ? undefined
              : () =>
                  ep.kind === "reflection"
                    ? onOpenReflection(ep)
                    : onPickEpisode(ep);

            return (
              <li key={ep.id}>
                <button
                  onClick={tap}
                  disabled={locked}
                  type="button"
                  style={{ touchAction: "manipulation" }}
                  className={`flex h-[68px] w-full flex-col items-center justify-center gap-0.5 rounded-[14px] border text-center transition ${
                    locked
                      ? "cursor-not-allowed border-black/5 bg-white/40 text-[#9a938b]"
                      : isDone
                      ? "border-black/5 bg-[#fff5d8] text-[#7a5e1f] active:scale-[0.97]"
                      : isNext
                      ? "border-[#f4be42] bg-white shadow-sm text-[#2a241d] active:scale-[0.97]"
                      : "border-black/5 bg-white/90 text-[#5f5a53] active:scale-[0.97]"
                  }`}
                >
                  <span className="text-[10px] font-bold opacity-80">
                    DAY
                  </span>
                  <span className="text-[16px] font-extrabold leading-none">
                    {i + 1}
                  </span>
                  <span className="text-[12px] leading-none">
                    {isDone ? "✓" : locked ? "🔒" : isNext ? "▶" : ""}
                    {ep.kind === "reflection" ? " 🎓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-auto text-center text-[10px] font-bold text-[#8a8178]">
          上から順に挑戦・クリア後はやり直し自由
        </p>

        <BottomNav />

        {showAbout && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center"
            onClick={() => setShowAbout(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] rounded-[24px] bg-white p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[16px] font-extrabold text-[#2a241d]">
                  Qhat について
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAbout(false)}
                  aria-label="閉じる"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] text-[#8a8178] active:bg-black/[0.05]"
                >
                  ×
                </button>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[#5f5a53]">
                会話のリハーサルアプリ。本番前に、安全に何度でもやり直せます。
                相手の感情は4つの状態（喜・安・不・戸）の重ね合わせとして可視化されます。
              </p>
              <p className="mt-3 text-[11px] leading-relaxed text-[#8a8178]">
                データはすべて端末内に保存されます。サーバーには会話内容を残しません。
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
