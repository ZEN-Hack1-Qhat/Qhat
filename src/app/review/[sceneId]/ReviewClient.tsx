"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Scene } from "@/lib/types";
import { useQhat } from "@/lib/store";
import { EmotionTrajectory } from "@/components/EmotionTrajectory";
import { dominant, EMOTION_LABEL } from "@/lib/emotion";
import {
  bumpGraduation,
  getGraduation,
  getSettings,
  saveSession,
  setSettings,
} from "@/lib/sessionStore";

function computeGraduationDelta(args: {
  turns: number;
  redoCount: number;
  finalAnxiety: number;
  startAnxiety: number;
}): number {
  const { turns, redoCount, finalAnxiety, startAnxiety } = args;
  if (turns === 0) return 0;
  // base reward for completing turns
  let delta = Math.min(20, turns * 3);
  // reward calming the partner down
  delta += Math.round((startAnxiety - finalAnxiety) * 30);
  // small penalty for excessive redos
  delta -= Math.max(0, redoCount - 2) * 2;
  return Math.max(-15, Math.min(25, delta));
}

export function ReviewClient({ scene }: { scene: Scene }) {
  const { messages, redoCount } = useQhat();
  const [saveOptIn, setSaveOptIn] = useState(false);
  const [graduation, setGraduation] = useState(0);
  const [committed, setCommitted] = useState(false);

  const stats = useMemo(() => {
    const charMessages = messages.filter((m) => m.role === "character");
    const userMessages = messages.filter((m) => m.role === "user");
    const turns = userMessages.length;
    const avgChars =
      turns === 0
        ? 0
        : Math.round(
            userMessages.reduce((a, m) => a + m.text.length, 0) / turns
          );
    const finalEmo = charMessages[charMessages.length - 1]?.emotion;
    const firstEmo = charMessages[0]?.emotion ?? scene.initialEmotion;
    return {
      turns,
      avgChars,
      redoCount,
      firstEmo,
      finalEmo,
      history: charMessages.map((m) => m.emotion!).filter(Boolean),
    };
  }, [messages, redoCount, scene.initialEmotion]);

  const startDom = dominant(stats.firstEmo);
  const endDom = stats.finalEmo ? dominant(stats.finalEmo) : startDom;

  const delta = useMemo(
    () =>
      computeGraduationDelta({
        turns: stats.turns,
        redoCount: stats.redoCount,
        startAnxiety: stats.firstEmo.anxiety,
        finalAnxiety: stats.finalEmo?.anxiety ?? stats.firstEmo.anxiety,
      }),
    [stats]
  );

  // Initialise from localStorage on mount.
  useEffect(() => {
    setSaveOptIn(getSettings().saveSessions);
    setGraduation(getGraduation(scene.id));
  }, [scene.id]);

  // Commit graduation + (optionally) save session — exactly once.
  useEffect(() => {
    if (committed || stats.turns === 0) return;
    const next = bumpGraduation(scene.id, delta);
    setGraduation(next);
    if (saveOptIn) {
      saveSession({
        id: `s_${Date.now()}`,
        sceneId: scene.id,
        startedAt: messages[0]?.timestamp ?? Date.now(),
        endedAt: Date.now(),
        messages,
        redoCount: stats.redoCount,
      });
    }
    setCommitted(true);
  }, [committed, delta, messages, saveOptIn, scene.id, stats.redoCount, stats.turns]);

  const handleToggleSave = (v: boolean) => {
    setSaveOptIn(v);
    setSettings({ saveSessions: v });
  };

  return (
    <main className="mx-auto max-w-4xl px-8 py-12">
      <header className="mb-10">
        <p className="label-en text-xs">Review</p>
        <h1 className="font-mincho text-3xl mt-1">
          ふりかえり ・ {scene.title}
        </h1>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <Stat label="総ターン数" value={`${stats.turns}`} />
        <Stat label="平均文字数" value={`${stats.avgChars}`} />
        <Stat label="録り直し回数" value={`${stats.redoCount}`} />
        <Stat
          label="感情の変化"
          value={`${EMOTION_LABEL[startDom]} → ${EMOTION_LABEL[endDom]}`}
        />
      </section>

      <section className="mb-10">
        <p className="label-en text-xs mb-2">Emotion trajectory</p>
        <div className="rounded border border-line bg-white p-4">
          <EmotionTrajectory history={stats.history} />
        </div>
        <p className="mt-3 text-xs text-ink-pale font-mincho">
          縦軸は4感情の確率（合計100%）。横軸は会話のターン。
        </p>
      </section>

      <section className="mb-10 rounded border border-gold-soft bg-gold-soft/20 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="label-en text-xs">Graduation</p>
          <span className="mono text-xs text-ink-soft">
            {graduation}% {delta !== 0 && (
              <span className={delta > 0 ? "text-emo-calm" : "text-purple"}>
                ({delta > 0 ? "+" : ""}{delta})
              </span>
            )}
          </span>
        </div>
        <div className="h-3 rounded-full bg-line/60 overflow-hidden mb-3">
          <div
            className="h-full bg-gold rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${graduation}%` }}
          />
        </div>
        <p className="font-mincho text-sm text-ink leading-relaxed">
          {graduation >= 100
            ? "🎓 卒業！本番に出かけて大丈夫です。"
            : graduation >= 70
            ? "もう少し。あと2〜3回のリハーサルで本番準備が整いそうです。"
            : stats.turns >= 5
            ? "しっかり最後まで続けられました。続けるほど「手応え」が育ちます。"
            : "短くてもOK。ターン数を伸ばすと卒業ゲージがぐっと進みます。"}
        </p>
      </section>

      <section className="mb-10 rounded border border-line bg-white p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={saveOptIn}
            onChange={(e) => handleToggleSave(e.target.checked)}
            className="mt-1 accent-gold"
          />
          <div className="text-sm text-ink leading-relaxed">
            <p className="font-mincho">このセッションをブラウザに保存する</p>
            <p className="text-xs text-ink-pale mt-1">
              保存先はあなたのブラウザの localStorage のみ。Qhat
              のサーバーには送られません。後で見返したいときだけON。
            </p>
          </div>
        </label>
      </section>

      <div className="flex gap-3">
        <Link
          href={`/conversation/${scene.id}`}
          className="px-6 py-2.5 bg-ink text-paper text-sm font-mincho rounded hover:bg-ink-soft"
        >
          もう一度
        </Link>
        <Link
          href="/"
          className="px-6 py-2.5 border border-line text-sm font-mincho rounded hover:border-ink"
        >
          終了する
        </Link>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-white p-4">
      <p className="label-en text-[10px]">{label}</p>
      <p className="font-mincho text-xl mt-1">{value}</p>
    </div>
  );
}
