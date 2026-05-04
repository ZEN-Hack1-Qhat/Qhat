"use client";

import { useEffect, useState } from "react";
import type { Scene } from "@/lib/types";
import { CHARACTERS } from "@/lib/characters";

const STARS = ["", "★☆☆", "★★☆", "★★★"];

interface Props {
  scene: Scene;
  onStart: (opts: { handsFree: boolean }) => void;
}

// Pre-flight screen so the user isn't dropped straight into the conversation.
// Shows context, lets them set hands-free preference, and runs a tiny breathing
// countdown — both to ground the user and to give the browser a moment to
// receive the user-gesture needed for getUserMedia / SpeechSynthesis on iOS.
export function SceneIntro({ scene, onStart }: Props) {
  const [handsFree, setHandsFree] = useState(true);
  const [phase, setPhase] = useState<"intro" | "breathe">("intro");
  const [countdown, setCountdown] = useState(3);
  const character = CHARACTERS[scene.characterId];

  useEffect(() => {
    if (phase !== "breathe") return;
    if (countdown === 0) {
      onStart({ handsFree });
      return;
    }
    const id = setTimeout(() => setCountdown((n) => n - 1), 1100);
    return () => clearTimeout(id);
  }, [phase, countdown, onStart, handsFree]);

  if (phase === "breathe") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-paper">
        <p className="label-en text-xs text-ink-pale mb-4">Breathe in…</p>
        <div className="relative w-40 h-40 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gold-soft animate-ping opacity-50" />
          <div className="absolute inset-4 rounded-full bg-gold-soft" />
          <span className="relative font-mincho text-5xl text-ink">
            {countdown === 0 ? "始" : countdown}
          </span>
        </div>
        <p className="mt-8 text-ink-soft font-mincho text-sm">
          ゆっくり呼吸しながら、{character.name}に会いに行きましょう。
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10">
      <div className="max-w-xl w-full">
        <p className="label-en text-xs text-ink-pale mb-3">Scene</p>
        <h1 className="font-mincho text-3xl mb-2">{scene.title}</h1>
        <p className="label-en text-xs">{STARS[scene.difficulty]}</p>

        <div className="mt-8 rounded-lg border border-line bg-white p-6">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center text-white font-mincho text-xl"
              style={{ background: character.accent }}
            >
              {character.name[0]}
            </div>
            <div>
              <p className="font-mincho text-base">{character.name}</p>
              <p className="text-xs text-ink-pale">{character.age}歳</p>
            </div>
          </div>
          <p className="text-sm text-ink-soft font-mincho leading-relaxed">
            {scene.description}
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-line bg-paper/40 p-5">
          <p className="label-en text-[10px] mb-3">How to talk</p>
          <label className="flex items-start gap-3 cursor-pointer mb-3">
            <input
              type="radio"
              name="mode"
              checked={handsFree}
              onChange={() => setHandsFree(true)}
              className="mt-1 accent-gold"
            />
            <div className="text-sm leading-relaxed">
              <p className="font-mincho">ハンズフリー（推奨）</p>
              <p className="text-xs text-ink-pale mt-0.5">
                喋り終わって少し黙ると、自動で送信される。実際の会話に近い感覚で練習できる。
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="mode"
              checked={!handsFree}
              onChange={() => setHandsFree(false)}
              className="mt-1 accent-gold"
            />
            <div className="text-sm leading-relaxed">
              <p className="font-mincho">手動</p>
              <p className="text-xs text-ink-pale mt-0.5">
                毎ターン「観測する →」ボタンを押して送信する。落ち着いて言葉を選びたいとき。
              </p>
            </div>
          </label>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => setPhase("breathe")}
            className="flex-1 px-6 py-3 bg-ink text-paper font-mincho rounded hover:bg-ink-soft"
          >
            深呼吸して始める
          </button>
          <a
            href="/"
            className="px-6 py-3 border border-line text-sm font-mincho rounded hover:border-ink"
          >
            戻る
          </a>
        </div>

        <p className="mt-6 text-[11px] text-ink-pale font-mincho text-center leading-relaxed">
          このあと {character.name} の方から声がかかります。<br />
          途中で詰まっても、何度でも「録り直す」ボタンでやり直せます。
        </p>
      </div>
    </main>
  );
}
