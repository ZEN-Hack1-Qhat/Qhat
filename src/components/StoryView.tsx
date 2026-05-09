"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { CHARACTERS } from "@/lib/characters";
import { SCENES } from "@/lib/scenes";
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

export function StoryView({ onPickEpisode, onOpenReflection }: StoryViewProps) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCompleted(new Set(getStoryProgress()));
    setLoaded(true);
  }, []);

  const next = useMemo(() => nextEpisode(completed), [completed]);
  const total = STORY_EPISODES.length;
  const done = completed.size;

  const handleStart = () => {
    if (!next) return;
    if (next.kind === "reflection") onOpenReflection(next);
    else onPickEpisode(next);
  };

  return (
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] py-6">
        <header className="flex items-center gap-2.5">
          <img
            src="/logo.png"
            alt="Qhat"
            className="h-12 w-12 object-contain"
          />
          <div>
            <h1 className="text-[22px] font-extrabold leading-tight">Qhat</h1>
            <p className="text-[11px] font-bold text-[#8a8178]">
              30日チャレンジ・話せるようになる
            </p>
          </div>
        </header>

        {/* Top progress card. Frames the whole arc as one journey, and
            surfaces the next actionable step right at the top so users
            don't have to scan the timeline to find where they are. */}
        <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-[12px] font-extrabold text-[#5f5a53]">
            <span>進行</span>
            <span>{loaded ? `${done} / ${total}` : "…"}</span>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
            <div
              className="h-full rounded-full bg-[#f4be42] transition-all"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          {next ? (
            <button
              onClick={handleStart}
              type="button"
              className="group w-full overflow-hidden rounded-[18px] bg-gradient-to-br from-[#ffd86a] to-[#f4a93b] p-[2px] shadow-[0_8px_22px_rgba(244,169,59,0.22)] transition active:scale-[0.99]"
            >
              <div className="rounded-[16px] bg-gradient-to-br from-[#fff5d8] to-[#ffe2a3] px-4 py-3 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-extrabold text-[#7a5e1f]">
                      Day {next.day}
                    </p>
                    <p className="text-[15px] font-extrabold text-[#2a241d]">
                      {next.kind === "reflection" ? "🎓 " : "🎤 "}
                      {next.title}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-[#7a5e1f]">
                      {next.learningGoal}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="text-[18px] font-extrabold text-[#7a5e1f] transition-transform group-active:translate-x-1"
                  >
                    →
                  </span>
                </div>
              </div>
            </button>
          ) : (
            <p className="text-center text-[13px] font-bold text-[#5f5a53]">
              🎓 全エピソードクリア。Qhat 卒業です。
            </p>
          )}
        </section>

        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-extrabold text-[#49433d]">
            タイムライン
          </h2>
          <p className="text-[10px] font-bold text-[#8a8178]">
            上から順に挑戦
          </p>
        </div>

        {/* Vertical timeline. Each row is one episode with its lock state.
            Past + current rows are tappable so users can replay; locked
            future rows are visible (so they know what's coming) but not
            tappable. */}
        <ul className="flex flex-col gap-2.5">
          {STORY_EPISODES.map((ep, i) => {
            const isDone = completed.has(ep.id);
            const isNext = next?.id === ep.id;
            // Future episode = something is between this and the head of
            // the uncompleted queue. We compute it cheaply by walking the
            // list once: if any prior episode is still undone, we're locked.
            const priorAllDone = STORY_EPISODES.slice(0, i).every((e) =>
              completed.has(e.id)
            );
            const locked = !isDone && !priorAllDone;

            const scene = SCENES.find((s) => s.id === ep.sceneId);
            const character = scene ? CHARACTERS[scene.characterId] : null;

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
                  className={`flex w-full items-start gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                    locked
                      ? "cursor-not-allowed border-black/5 bg-white/40"
                      : isNext
                      ? "border-[#f4be42] bg-white shadow-sm active:scale-[0.99]"
                      : "border-black/5 bg-white/85 active:scale-[0.99]"
                  }`}
                >
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${
                      isDone
                        ? "bg-[#f4be42] text-[#2a241d]"
                        : isNext
                        ? "bg-[#fff3d2] text-[#7a5e1f]"
                        : locked
                        ? "bg-[#ece8df] text-[#9a938b]"
                        : "bg-[#fafaf6] text-[#6c665f]"
                    }`}
                  >
                    {isDone ? "✓" : locked ? "🔒" : `D${ep.day}`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-[13px] font-extrabold ${
                          locked ? "text-[#9a938b]" : "text-[#49433d]"
                        }`}
                      >
                        {ep.kind === "reflection" ? "🎓 " : ""}
                        Day {ep.day}・{ep.title}
                      </p>
                      {isNext && (
                        <span className="shrink-0 rounded-full bg-[#f4be42] px-2 py-0.5 text-[9px] font-extrabold text-[#2a241d]">
                          NEXT
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-0.5 text-[11px] font-bold leading-relaxed ${
                        locked ? "text-[#b3aca3]" : "text-[#8a8178]"
                      }`}
                    >
                      {ep.learningGoal}
                    </p>
                    {character && !locked && (
                      <p className="mt-1 text-[10px] font-bold text-[#9a938b]">
                        相手: {character.name}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-2 text-[11px] leading-relaxed text-[#8a8178]">
          順番に進む構成ですが、クリア済みの日は何度でもやり直せます。Day 30 まで来たら、Qhat はもう必要ありません。
        </p>

        <BottomNav />
      </div>
    </main>
  );
}
