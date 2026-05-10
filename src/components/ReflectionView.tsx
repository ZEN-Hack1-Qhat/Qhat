"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { CHARACTERS } from "@/lib/characters";
import { EMOTION_COLOR, EMOTION_LABEL } from "@/lib/emotion";
import { type StoryEpisode } from "@/lib/story";
import { getEffectiveLines, type EffectiveLine } from "@/lib/sessionStore";

interface ReflectionViewProps {
  episode: StoryEpisode;
  // "1ヶ月の振り返り" を読み終えた = 卒業確定。コール後はホームへ戻る。
  onComplete: () => void;
  // 「やっぱり戻る」用。卒業をまだ確定したくないユーザー向け。
  onBack: () => void;
}

// The Day 30 finale screen. Not a conversation — a quiet, static
// recognition that the practitioner has gone through the full arc.
// Deliberately light on celebration: the spirit is "もう Qhat は
// いらない" rather than "おめでとう、ご褒美です".
export function ReflectionView({
  episode,
  onComplete,
  onBack,
}: ReflectionViewProps) {
  const [effectiveLines, setEffectiveLines] = useState<EffectiveLine[]>([]);

  useEffect(() => {
    // Sort by absolute delta so the strongest "this really worked" lines
    // surface first. Ties broken by recency. Cap at a comfortable read
    // count — the reflection is a moment, not a feed to scroll.
    const lines = [...getEffectiveLines()]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
    setEffectiveLines(lines);
  }, []);

  return (
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] pb-28 pt-6">
        <header className="flex items-center justify-between">
          <button
            onClick={onBack}
            type="button"
            aria-label="戻る"
            className="flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-[12px] font-extrabold text-[#5f5a53] backdrop-blur transition active:scale-[0.98]"
          >
            <span aria-hidden>←</span>
            <span>戻る</span>
          </button>
          <span className="text-[12px] font-bold text-[#8a8178]">
            Day {episode.day}
          </span>
        </header>

        <section className="rounded-[28px] border border-black/5 bg-white/85 p-6 text-center shadow-sm">
          <p className="mb-2 text-[40px]">🎓</p>
          <h1 className="mb-2 text-[20px] font-extrabold text-[#49433d]">
            1ヶ月の振り返り
          </h1>
          <p className="text-[12px] font-bold leading-relaxed text-[#6c665f]">
            ここまで来たら、もう Qhat を卒業して大丈夫です。
            <br />
            あなたは、本番に出ていける場所まで来ました。
          </p>
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm">
          <h2 className="mb-3 text-[13px] font-extrabold text-[#49433d]">
            この30日でやってきたこと
          </h2>
          <ul className="space-y-2 text-[13px] leading-relaxed text-[#5f5a53]">
            <li>・一言で、会話は始まる</li>
            <li>・拾って返せば、続く</li>
            <li>・詰まったら、詰まったと言える</li>
            <li>・自分からも、声をかけられる</li>
          </ul>
        </section>

        {effectiveLines.length > 0 && (
          <section className="rounded-[24px] border border-black/5 bg-white/85 p-5 shadow-sm">
            <h2 className="mb-1 text-[13px] font-extrabold text-[#49433d]">
              あなたの効いた言葉
            </h2>
            <p className="mb-3 text-[11px] leading-relaxed text-[#8a8178]">
              相手の気持ちが大きく動いた瞬間に、あなたが言った言葉です。本番でも、これらは効きます。
            </p>
            <ul className="space-y-2.5">
              {effectiveLines.map((l, i) => {
                const char = CHARACTERS[l.characterId];
                const positive =
                  (l.emotion === "joy" || l.emotion === "calm") && l.delta > 0;
                const negative =
                  (l.emotion === "anxiety" || l.emotion === "confusion") &&
                  l.delta < 0;
                const label = positive
                  ? `${EMOTION_LABEL[l.emotion]}が上がった`
                  : negative
                  ? `${EMOTION_LABEL[l.emotion]}が下がった`
                  : `${EMOTION_LABEL[l.emotion]}が動いた`;
                return (
                  <li
                    key={`${l.text}_${i}`}
                    className="rounded-[14px] border border-black/5 bg-[#fafaf6] p-3"
                  >
                    <p className="text-[13px] font-bold leading-relaxed text-[#49433d]">
                      「{l.text}」
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-[#8a8178]">
                      {char ? `${char.name}に・` : ""}
                      <span style={{ color: EMOTION_COLOR[l.emotion] }}>
                        {label}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="rounded-[24px] border border-black/5 bg-[#fff5d8]/80 p-5 shadow-sm">
          <h2 className="mb-2 text-[13px] font-extrabold text-[#7a5e1f]">
            次は、本番で。
          </h2>
          <p className="text-[12px] leading-relaxed text-[#7a5e1f]">
            Qhat の役目はここまでです。
            アプリを開かなくなる日が、ほんとうの卒業の日です。
            うまくいかない日があっても、それは戻ってくる理由ではなく、
            前に進んでいる証拠です。
          </p>
        </section>

        <button
          onClick={onComplete}
          type="button"
          className="rounded-full bg-[#f4be42] px-6 py-3.5 text-[15px] font-extrabold text-[#2a241d] shadow-[0_8px_22px_rgba(244,190,66,0.28)] transition active:scale-[0.99]"
        >
          卒業する
        </button>

        <p className="text-center text-[10px] font-bold text-[#8a8178]">
          いつでも、Qhat に戻ってきても大丈夫です。
        </p>

        <BottomNav />
      </div>
    </main>
  );
}
