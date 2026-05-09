"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import type { Goal } from "@/lib/goals";
import { checkAllGoals } from "@/lib/goals";
import type { StoryEpisode } from "@/lib/story";
import type { Message } from "@/lib/types";

interface EpisodeReviewProps {
  episode: StoryEpisode;
  messages: Message[];
  // Goal ids the LLM accepted as satisfied during this conversation. The
  // review needs them so the LLM (or the heuristic fallback) can ground
  // its praise/next-step in what actually happened.
  llmHitGoalIds: string[];
  // User pressed "次へ"; return to the timeline.
  onNext: () => void;
}

interface ReviewResult {
  goodPoint: { quote: string; reason: string };
  nextStep: string;
  verdict: string;
  mode: "gemini" | "groq" | "mock";
}

// Post-conversation review screen. Shown after 完了 is tapped, before
// returning to the timeline. Single page, three sections — recognition
// of one specific thing that worked, one specific thing to try next,
// and a closing line. No scores, no levels.
export function EpisodeReview({
  episode,
  messages,
  llmHitGoalIds,
  onNext,
}: EpisodeReviewProps) {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Build the goals_hit / goals_missed labels client-side. Heuristic
    // checks + the LLM hit set together give us the "satisfied" view; the
    // remainder is "missed". We pass *labels* (not ids) to the API so the
    // backend prompt is human-readable without an extra lookup table.
    const goals = episode.goals ?? [];
    const llmSet = new Set(llmHitGoalIds);
    const heuristic = checkAllGoals(goals as Goal[], messages);
    const hit: string[] = [];
    const missed: string[] = [];
    for (const { goal, done } of heuristic) {
      if (done || llmSet.has(goal.id)) hit.push(goal.label);
      else missed.push(goal.label);
    }

    fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        episode_id: episode.id,
        goals_hit: hit,
        goals_missed: missed,
        // Only the fields the review needs — strip large optional ones so
        // the payload stays well under the 128KB cap.
        messages: messages.map((m) => ({
          role: m.role,
          text: m.text,
          speaker: m.speaker,
          emotion: m.emotion,
          dominant: m.dominant,
        })),
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        setResult(data as ReviewResult);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [episode, messages, llmHitGoalIds]);

  return (
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[14px] px-[18px] py-6">
        <header className="flex items-center justify-between">
          <span className="text-[12px] font-extrabold text-[#5f5a53]">
            ふりかえり
          </span>
          <span className="text-[11px] font-bold text-[#8a8178]">
            Day {episode.day}・{episode.title}
          </span>
        </header>

        {!result && !error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12">
            <div className="flex gap-1">
              <span className="thinking-dot" />
              <span className="thinking-dot delay-150" />
              <span className="thinking-dot delay-300" />
            </div>
            <p className="text-[12px] font-bold text-[#8a8178]">
              ふりかえり中…
            </p>
          </div>
        )}

        {error && (
          <section className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm">
            <p className="mb-2 text-[14px] font-bold text-[#49433d]">
              ふりかえりの取得に失敗しました
            </p>
            <p className="text-[11px] leading-relaxed text-[#8a8178]">
              通信エラーかもしれません。それでも今日の練習はちゃんと完了しています。
            </p>
          </section>
        )}

        {result && (
          <>
            <section className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm">
              <h2 className="mb-2 text-[12px] font-extrabold tracking-wide text-[#3d8f54]">
                ✓ 良かった点
              </h2>
              {result.goodPoint.quote ? (
                <p className="mb-2 rounded-[12px] bg-[#f5faf6] px-3 py-2 text-[14px] font-bold leading-relaxed text-[#49433d]">
                  「{result.goodPoint.quote}」
                </p>
              ) : null}
              <p className="text-[12px] leading-relaxed text-[#5f5a53]">
                {result.goodPoint.reason}
              </p>
            </section>

            <section className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm">
              <h2 className="mb-2 text-[12px] font-extrabold tracking-wide text-[#7a5e1f]">
                → 次に試すこと
              </h2>
              <p className="text-[13px] leading-relaxed text-[#49433d]">
                {result.nextStep}
              </p>
            </section>

            <section className="rounded-[24px] border border-[#f4be42]/40 bg-[#fff5d8]/80 p-5 shadow-sm">
              <p className="text-[14px] font-extrabold leading-relaxed text-[#49433d]">
                {result.verdict}
              </p>
            </section>

            <p className="text-center text-[10px] font-bold text-[#9a938b]">
              {result.mode === "mock"
                ? "ローカル判定（オフライン）"
                : `判定: ${result.mode}`}
            </p>
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={onNext}
          type="button"
          className="rounded-full bg-[#f4be42] px-6 py-3.5 text-[15px] font-extrabold text-[#2a241d] shadow-[0_8px_22px_rgba(244,190,66,0.28)] transition active:scale-[0.99]"
        >
          次へ
        </button>

        <BottomNav />
      </div>
    </main>
  );
}
