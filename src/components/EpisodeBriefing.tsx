"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { CHARACTERS } from "@/lib/characters";
import { SCENES } from "@/lib/scenes";
import {
  characterGraduationStatus,
  type StoryEpisode,
} from "@/lib/story";
import { getStoryProgress } from "@/lib/sessionStore";

interface EpisodeBriefingProps {
  episode: StoryEpisode;
  // User read the briefing and tapped "始める" — open the conversation.
  onStart: () => void;
  // User tapped back — return to the timeline without starting.
  onBack: () => void;
}

// Pre-conversation briefing screen. The job here is to load the user with
// just enough context that they walk into the scene with intent:
//
//   - what's about to happen (situation)
//   - who the partner is (so the voice/register isn't a surprise)
//   - what they're practicing (the learning goal)
//   - 2–3 concrete moves they can try (tips)
//
// We deliberately keep it short — one screen, no scrolling on a phone for
// most days. If a briefing starts demanding a scroll we're packing it too
// hard and should split content out instead.
export function EpisodeBriefing({
  episode,
  onStart,
  onBack,
}: EpisodeBriefingProps) {
  const scene = SCENES.find((s) => s.id === episode.sceneId);
  const character = scene ? CHARACTERS[scene.characterId] : null;

  // Character-level graduation status. Loaded on mount because the same
  // partner appears across multiple Days and seeing "もう普通に話せる" on
  // the briefing card lands harder than waiting until Day 30.
  const [charStatus, setCharStatus] = useState<{
    total: number;
    done: number;
    graduated: boolean;
  } | null>(null);

  useEffect(() => {
    if (!character) return;
    const completed = new Set(getStoryProgress());
    const status = characterGraduationStatus(
      character.id,
      (sceneId) => SCENES.find((s) => s.id === sceneId)?.characterId,
      completed
    );
    setCharStatus(status);
  }, [character]);

  return (
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[14px] px-[18px] py-6">
        <header className="flex items-center justify-between">
          <button
            onClick={onBack}
            type="button"
            aria-label="ストーリーに戻る"
            className="flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-[12px] font-extrabold text-[#5f5a53] backdrop-blur transition active:scale-[0.98]"
          >
            <span aria-hidden>←</span>
            <span>戻る</span>
          </button>
          <span className="text-[11px] font-bold text-[#8a8178]">
            ブリーフィング
          </span>
        </header>

        <div className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm">
          <p className="mb-1 text-[11px] font-extrabold tracking-wide text-[#7a5e1f]">
            DAY {episode.day}
          </p>
          <h1 className="text-[20px] font-extrabold leading-tight text-[#49433d]">
            {episode.title}
          </h1>
        </div>

        {/* Who you'll talk to. The character chip helps users mentally cast
            the voice & relationship before pressing play, especially after
            the first few episodes when partners start repeating. */}
        {character && scene && (
          <div className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
            <p className="mb-2 text-[11px] font-extrabold tracking-wide text-[#8a8178]">
              きょうの相手
            </p>
            <div className="mb-3 flex items-center gap-3">
              <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[16px] font-extrabold text-white"
                style={{ background: character.accent }}
              >
                {character.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-extrabold text-[#49433d]">
                    {character.name}
                  </p>
                  {/* Character-level graduation. Only multi-episode partners
                      can earn this — a one-off contact can't really be
                      "卒業". Shows progress mid-arc ("2/3") and a clean
                      "卒業" tag when all featuring episodes are done. */}
                  {charStatus && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${
                        charStatus.graduated
                          ? "bg-[#e9d8a6] text-[#7c5e1f]"
                          : "border border-black/10 bg-white/60 text-[#8a8178]"
                      }`}
                    >
                      {charStatus.graduated
                        ? "🎓 卒業"
                        : `関係 ${charStatus.done}/${charStatus.total}`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-bold text-[#8a8178]">
                  {character.age}歳・
                  {character.profile.register === "formal"
                    ? "敬語ベース"
                    : character.profile.register === "casual"
                    ? "カジュアル"
                    : "敬語と砕けた口調が混ざる"}
                </p>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-[#5f5a53]">
              {scene.description}
            </p>
          </div>
        )}

        {/* The learning goal. Highlighted card — this is the single thing
            we want them to walk in with. Worded as a target not a rule. */}
        <div className="rounded-[24px] border border-[#f4be42]/40 bg-[#fff5d8]/80 p-4 shadow-sm">
          <p className="mb-1 text-[11px] font-extrabold tracking-wide text-[#7a5e1f]">
            きょう練習すること
          </p>
          <p className="text-[14px] font-bold leading-relaxed text-[#49433d]">
            {episode.learningGoal}
          </p>
        </div>

        {episode.tips.length > 0 && (
          <div className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
            <p className="mb-2 text-[11px] font-extrabold tracking-wide text-[#8a8178]">
              使える手
            </p>
            <ul className="space-y-1.5">
              {episode.tips.map((tip, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-[12px] leading-relaxed text-[#5f5a53]"
                >
                  <span className="shrink-0 text-[#f4be42]">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The "minimum turns" promise. Sets expectations: "this isn't
            one-tap-and-done" without being heavy-handed. The number is
            small enough not to scare anyone (1–4). */}
        <p className="text-center text-[11px] font-bold text-[#8a8178]">
          目安: {episode.minTurns} 往復ぐらい話せたら完了です
        </p>

        <div className="flex-1" />

        <button
          onClick={onStart}
          type="button"
          className="rounded-full bg-[#f4be42] px-6 py-3.5 text-[15px] font-extrabold text-[#2a241d] shadow-[0_8px_22px_rgba(244,190,66,0.28)] transition active:scale-[0.99]"
        >
          🎤 会話をはじめる
        </button>

        <BottomNav />
      </div>
    </main>
  );
}
