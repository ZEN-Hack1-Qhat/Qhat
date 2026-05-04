"use client";

import { useEffect, useState } from "react";
import type { Emotion, EmotionProbs } from "@/lib/types";
import { CHARACTERS } from "@/lib/characters";
import { CharacterPortrait } from "./CharacterPortrait";
import { dominant, entropy, EMOTION_LABEL } from "@/lib/emotion";

interface Props {
  characterId: string;
  emotion: EmotionProbs;
  decoherence: number;
  reactionBubble?: string;
  reactionKey?: string | number;
  thinking?: boolean;
  speaking?: boolean;
  proactive?: boolean;
}

export function CharacterPanel({
  characterId,
  emotion,
  decoherence,
  reactionBubble,
  reactionKey,
  thinking,
  speaking,
  proactive,
}: Props) {
  const c = CHARACTERS[characterId];
  const dom = dominant(emotion);
  const h = entropy(emotion);
  const isHighEntropy = h > 1.85;
  const wobble = decoherence > 60;

  const [showBubble, setShowBubble] = useState(false);
  useEffect(() => {
    if (!reactionBubble) return;
    setShowBubble(true);
    const t = setTimeout(() => setShowBubble(false), 2000);
    return () => clearTimeout(t);
  }, [reactionBubble, reactionKey]);

  return (
    <div className="relative flex flex-col items-center">
      <div className="text-center mb-3">
        <p className="font-mincho text-base">{c.name}</p>
        <p className="text-[11px] text-ink-pale">
          {c.age}歳 ・ {EMOTION_LABEL[isHighEntropy ? "confusion" : dom]}
        </p>
      </div>

      <div
        className={`relative w-[240px] transition-transform duration-500 ${wobble ? "animate-wobble" : ""} ${proactive ? "scale-105" : ""}`}
      >
        {/* reaction bubble */}
        {showBubble && reactionBubble && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 animate-bubble">
            <div className="relative">
              <div className="rounded-2xl bg-white border border-line px-4 py-2 shadow-sm font-mincho text-sm text-ink whitespace-nowrap">
                💭 {reactionBubble}
              </div>
              <div
                className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-3 h-3 bg-white border-r border-b border-line"
                style={{ transform: "translate(-50%, 50%) rotate(45deg)" }}
              />
            </div>
          </div>
        )}

        <div
          className="relative aspect-[2/3] transition-opacity duration-500"
          key={`${dom}-${isHighEntropy}-${thinking ? "t" : "n"}`}
        >
          <CharacterPortrait
            characterId={characterId}
            emotion={isHighEntropy ? "confusion" : dom}
            thinking={thinking}
            speaking={speaking}
          />
        </div>
      </div>

      {proactive && (
        <p className="mt-3 label-en text-xs text-gold">
          ↪ proactive
        </p>
      )}
    </div>
  );
}
