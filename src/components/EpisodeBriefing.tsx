"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { CHARACTERS } from "@/lib/characters";
import { SCENES } from "@/lib/scenes";
import {
  characterGraduationStatus,
  type StoryEpisode,
} from "@/lib/story";
import { getStoryProgress } from "@/lib/sessionStore";
import { speak } from "@/lib/speech";

interface EpisodeBriefingProps {
  episode: StoryEpisode;
  // User read the briefing and tapped "始める" — open the conversation.
  onStart: () => void;
  // User tapped back — return to the timeline without starting.
  onBack: () => void;
}

interface BriefingStep {
  // Optional small label above the bubble — "今日の目標" etc. Keeps the
  // user oriented on what kind of beat this is without crowding the speech.
  kind: string;
  // Body text the character "says". Keep tight (one breath per card).
  body: string;
}

function buildSteps(episode: StoryEpisode): BriefingStep[] {
  const steps: BriefingStep[] = [];
  if (episode.intro) {
    steps.push({ kind: "シーン", body: episode.intro });
  }
  steps.push({ kind: "今日の目標", body: episode.learningGoal });
  for (const tip of episode.tips) {
    steps.push({ kind: "使える手", body: tip });
  }
  steps.push({
    kind: "じゃあ、いこう",
    body: `${episode.minTurns}往復ぐらい話せたら完了。完璧じゃなくていい。`,
  });
  return steps;
}

// Pre-conversation briefing. Re-imagined as a stepped character monologue:
// the partner "presents" the day one card at a time. Each tap advances; TTS
// reads the current line. Designed to feel like the character is briefing
// the practitioner before the scene, not a static info panel.
export function EpisodeBriefing({
  episode,
  onStart,
  onBack,
}: EpisodeBriefingProps) {
  const scene = SCENES.find((s) => s.id === episode.sceneId);
  const character = scene ? CHARACTERS[scene.characterId] : null;

  const steps = useMemo(() => buildSteps(episode), [episode]);
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  // Character-level graduation status. Same as before — only surfaced when
  // the partner has 2+ episodes so the chip means something.
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

  // Each step gets read aloud the moment it appears. We track the last
  // spoken index in a ref so re-renders (e.g. graduation status loading)
  // don't re-trigger TTS on the same card.
  const spokenRef = useRef<number>(-1);
  useEffect(() => {
    if (!character) return;
    if (spokenRef.current === stepIdx) return;
    spokenRef.current = stepIdx;
    speak(step.body, { ...character.voice });
  }, [stepIdx, step, character]);

  const advance = () => {
    if (isLast) {
      onStart();
      return;
    }
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };

  const back = () => {
    if (stepIdx === 0) {
      onBack();
      return;
    }
    setStepIdx((i) => Math.max(i - 1, 0));
  };

  const accent = character?.accent ?? "#f4be42";
  const initial = character?.name?.[0] ?? "?";

  return (
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[14px] px-[18px] pb-28 pt-6">
        <header className="flex items-center justify-between">
          <button
            onClick={back}
            type="button"
            aria-label={stepIdx === 0 ? "ストーリーに戻る" : "前のページ"}
            className="flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-[12px] font-extrabold text-[#5f5a53] backdrop-blur transition active:scale-[0.98]"
          >
            <span aria-hidden>←</span>
            <span>{stepIdx === 0 ? "戻る" : "前へ"}</span>
          </button>
          <span className="text-[12px] font-bold text-[#8a8178]">
            DAY {episode.day}
          </span>
        </header>

        {/* Progress dots — show how many beats are left without making the
            user count cards. Tapping a dot jumps directly to that step so
            re-reading a tip doesn't require restarting the briefing. */}
        <div className="flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStepIdx(i)}
              type="button"
              aria-label={`ステップ ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIdx
                  ? "w-6 bg-[#f4be42]"
                  : i < stepIdx
                  ? "w-1.5 bg-[#e0d6c2]"
                  : "w-1.5 bg-black/10"
              }`}
            />
          ))}
        </div>

        {/* Body region — single big tap target. Tapping anywhere advances
            to the next step (or starts the conversation on the last). */}
        <button
          onClick={advance}
          type="button"
          className="flex flex-1 flex-col items-center justify-center gap-5 rounded-[24px] text-left active:scale-[0.99]"
        >
          {/* Title row above the title card on the day's first step. */}
          {stepIdx === 0 && (
            <div className="text-center">
              <h1 className="text-[22px] font-extrabold leading-tight text-[#49433d]">
                {episode.title}
              </h1>
              {character && (
                <p className="mt-1 text-[12px] font-bold text-[#8a8178]">
                  きょうの相手・{character.name}
                  {charStatus && (
                    <>
                      {" "}
                      {charStatus.graduated
                        ? "🎓"
                        : `(${charStatus.done}/${charStatus.total})`}
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Speech bubble — the actual "what the character is saying" beat.
              Sized for one breath of text; intro lines wrap, the rest fit. */}
          <div className="qhat-fade-in relative w-full max-w-[360px]" key={stepIdx}>
            <p className="mb-1 text-center text-[11px] font-extrabold tracking-wide text-[#7a5e1f]">
              {step.kind}
            </p>
            <div className="relative rounded-[24px] border border-black/5 bg-white px-5 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
              <p className="text-[15px] font-bold leading-relaxed text-[#3d3833]">
                {step.body}
              </p>
              {/* Tail pointing down to the character */}
              <div
                aria-hidden
                className="absolute left-1/2 -bottom-2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-black/5 bg-white"
              />
            </div>
          </div>

          {/* The "presenter": a simple circular avatar in the character's
              accent. Subtle bob keeps it feeling alive while the speech is
              being read; no SVG so this stays light and consistent across
              all characters. */}
          <div className="qhat-character-bob flex flex-col items-center gap-2">
            <div
              className="grid h-24 w-24 place-items-center rounded-full text-[40px] font-extrabold text-white shadow-[0_12px_28px_rgba(0,0,0,0.12)]"
              style={{
                background: accent,
                backgroundImage: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.4), transparent 36%), linear-gradient(180deg, ${accent}, ${accent})`,
              }}
            >
              {initial}
            </div>
            {character && (
              <p className="text-[11px] font-bold text-[#8a8178]">
                {character.name}
              </p>
            )}
          </div>
        </button>

        <button
          onClick={advance}
          type="button"
          className={`rounded-full px-6 py-3.5 text-[15px] font-extrabold transition active:scale-[0.99] ${
            isLast
              ? "bg-[#f4be42] text-[#2a241d] shadow-[0_8px_22px_rgba(244,190,66,0.28)]"
              : "border border-black/10 bg-white text-[#5f5a53]"
          }`}
        >
          {isLast ? "🎤 会話をはじめる" : "次へ →"}
        </button>

        <BottomNav />
      </div>
    </main>
  );
}
