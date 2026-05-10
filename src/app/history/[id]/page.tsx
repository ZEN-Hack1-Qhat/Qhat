"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { EmotionTrajectory } from "@/components/EmotionTrajectory";
import { CHARACTERS } from "@/lib/characters";
import { SCENES } from "@/lib/scenes";
import {
  EMOTIONS,
  EMOTION_COLOR,
  EMOTION_LABEL,
  dominant,
} from "@/lib/emotion";
import { loadSessions, type SavedSession } from "@/lib/sessionStore";
import type { EmotionProbs, Message } from "@/lib/types";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

// Compact 4-segment bar showing the full emotion distribution at a single
// turn. Used inline under each character reply so the practitioner can see
// "this is roughly how the partner felt right then" at a glance, without
// having to read the trajectory chart for every line.
function EmotionMini({ probs }: { probs: EmotionProbs }) {
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
      {EMOTIONS.map((e) => (
        <div
          key={e}
          className="h-full transition-all"
          style={{
            width: `${(probs[e] ?? 0) * 100}%`,
            background: EMOTION_COLOR[e],
          }}
        />
      ))}
    </div>
  );
}

// Pretty-print the largest delta from the previous turn so users can see
// "anxiety dropped a lot just then" without doing the math themselves.
// Returns null when the change is too small to matter — keeps the log
// quiet on no-op turns.
function deltaSummary(
  prev: EmotionProbs | undefined,
  curr: EmotionProbs
): { label: string; emotion: string; sign: number } | null {
  if (!prev) return null;
  let bestKey: keyof EmotionProbs = "joy";
  let bestVal = 0;
  for (const e of EMOTIONS) {
    const d = curr[e] - prev[e];
    if (Math.abs(d) > Math.abs(bestVal)) {
      bestVal = d;
      bestKey = e;
    }
  }
  if (Math.abs(bestVal) < 0.08) return null;
  const sign = bestVal > 0 ? 1 : -1;
  return {
    label: EMOTION_LABEL[bestKey],
    emotion: bestKey,
    sign,
  };
}

export default function HistoryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [session, setSession] = useState<SavedSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const all = loadSessions();
    setSession(all.find((s) => s.id === id) ?? null);
    setLoaded(true);
  }, [id]);

  const scene = session
    ? SCENES.find((s) => s.id === session.sceneId)
    : undefined;
  const character = scene ? CHARACTERS[scene.characterId] : null;

  // Trajectory chart wants only the per-character emotion snapshots, in
  // order. The user's own messages don't carry an emotion field.
  const trajectory: EmotionProbs[] = session
    ? session.messages
        .filter((m) => m.role === "character" && !!m.emotion)
        .map((m) => m.emotion!)
    : [];

  const userTurns = session
    ? session.messages.filter((m) => m.role === "user").length
    : 0;

  return (
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[14px] px-[18px] pb-28 pt-6">
        <header className="flex items-center justify-between">
          <Link
            href="/history"
            className="flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-[12px] font-extrabold text-[#5f5a53] backdrop-blur transition active:scale-[0.98]"
          >
            <span aria-hidden>←</span>
            <span>履歴</span>
          </Link>
          {session && (
            <span className="text-[11px] font-bold text-[#8a8178]">
              {formatDate(session.startedAt)}
            </span>
          )}
        </header>

        {!loaded ? (
          <p className="text-center text-[12px] text-[#8a8178]">読み込み中…</p>
        ) : !session ? (
          <section className="rounded-[24px] border border-black/5 bg-white/85 p-6 text-center shadow-sm">
            <p className="mb-1 text-[14px] font-bold text-[#49433d]">
              この会話は見つかりませんでした
            </p>
            <p className="text-[11px] leading-relaxed text-[#8a8178]">
              端末内に保存されたセッションが消えたか、別の端末で記録されたものかもしれません。
            </p>
          </section>
        ) : (
          <>
            <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
              <h1 className="text-[17px] font-extrabold text-[#49433d]">
                {scene?.title ?? session.sceneId}
              </h1>
              <p className="mt-1 text-[11px] font-bold text-[#8a8178]">
                {character ? `${character.name}（${character.age}歳）・` : ""}
                {userTurns} 往復
              </p>
            </section>

            {trajectory.length > 0 && (
              <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[12px] font-extrabold text-[#49433d]">
                    感情の流れ
                  </h2>
                  <p className="text-[10px] font-bold text-[#8a8178]">
                    縦=4感情の確率
                  </p>
                </div>
                <EmotionTrajectory history={trajectory} />
                <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] font-bold">
                  {EMOTIONS.map((e) => (
                    <div key={e} className="flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: EMOTION_COLOR[e] }}
                      />
                      <span className="text-[#5f5a53]">
                        {EMOTION_LABEL[e]}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {session.review && (
              <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
                <h2 className="mb-3 text-[12px] font-extrabold text-[#49433d]">
                  この会話のふりかえり
                </h2>
                <div className="mb-3 rounded-[14px] border border-[#3d8f54]/20 bg-[#f5faf6] p-3">
                  <p className="mb-1 text-[10px] font-extrabold tracking-wide text-[#3d8f54]">
                    ✓ 良かった点
                  </p>
                  {session.review.goodPoint.quote && (
                    <p className="mb-1 text-[12px] font-bold leading-relaxed text-[#49433d]">
                      「{session.review.goodPoint.quote}」
                    </p>
                  )}
                  <p className="text-[11px] leading-relaxed text-[#5f5a53]">
                    {session.review.goodPoint.reason}
                  </p>
                </div>
                <div className="mb-3 rounded-[14px] border border-[#7a5e1f]/20 bg-[#fff5d8]/50 p-3">
                  <p className="mb-1 text-[10px] font-extrabold tracking-wide text-[#7a5e1f]">
                    → 次に試すこと
                  </p>
                  <p className="text-[12px] leading-relaxed text-[#49433d]">
                    {session.review.nextStep}
                  </p>
                </div>
                <p className="text-[12px] font-extrabold leading-relaxed text-[#49433d]">
                  {session.review.verdict}
                </p>
                <p className="mt-2 text-right text-[9px] font-bold text-[#9a938b]">
                  {session.review.mode === "mock"
                    ? "ローカル判定"
                    : `判定: ${session.review.mode}`}
                </p>
              </section>
            )}

            <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
              <h2 className="mb-3 text-[12px] font-extrabold text-[#49433d]">
                会話
              </h2>
              <ConversationTranscript messages={session.messages} />
            </section>
          </>
        )}

        <BottomNav />
      </div>
    </main>
  );
}

// Inline transcript renderer styled to match the rest of Qhat (the older
// ConversationLog component uses the legacy "ink/paper/mincho" tokens
// that don't fit the current beige aesthetic). Each character bubble
// carries its emotion mini-bar plus a tiny delta hint when the change
// from the previous turn is large enough to be interesting.
function ConversationTranscript({ messages }: { messages: Message[] }) {
  let prevEmotion: EmotionProbs | undefined;

  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        if (m.role === "user") {
          return (
            <li key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-[16px] rounded-tr-[6px] bg-[#f4be42] px-3.5 py-2 text-[13px] font-bold text-[#2a241d] shadow-sm">
                {m.text}
              </div>
            </li>
          );
        }
        const speaker = m.speaker ? CHARACTERS[m.speaker] : null;
        const emo = m.emotion;
        const dom = m.dominant ?? (emo ? dominant(emo) : null);
        const delta = emo ? deltaSummary(prevEmotion, emo) : null;
        if (emo) prevEmotion = emo;

        return (
          <li key={m.id} className="flex max-w-[90%] flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold text-[#5f5a53]">
                {speaker?.name ?? "相手"}
              </span>
              {dom && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold"
                  style={{
                    background: EMOTION_COLOR[dom] + "22",
                    color: EMOTION_COLOR[dom],
                  }}
                >
                  {EMOTION_LABEL[dom]}
                </span>
              )}
              {m.proactive && (
                <span className="text-[9px] font-bold text-[#7a5e1f]">
                  ↪ 相手から
                </span>
              )}
            </div>
            <div className="rounded-[16px] rounded-tl-[6px] border border-black/5 bg-white px-3.5 py-2 text-[13px] leading-relaxed text-[#49433d] shadow-sm">
              {m.text}
            </div>
            {emo && <EmotionMini probs={emo} />}
            {delta && (
              <p
                className="text-[10px] font-bold"
                style={{ color: EMOTION_COLOR[delta.emotion as keyof typeof EMOTION_COLOR] }}
              >
                {delta.sign > 0 ? "↑" : "↓"} {delta.label}が
                {delta.sign > 0 ? "上がった" : "下がった"}
              </p>
            )}
            {m.receptionSummary && (
              <p className="text-[10px] font-bold italic text-[#8a8178]">
                — {m.receptionSummary}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
