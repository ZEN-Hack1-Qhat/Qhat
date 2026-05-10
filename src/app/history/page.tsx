"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { CHARACTERS } from "@/lib/characters";
import { SCENES } from "@/lib/scenes";
import { dominant, EMOTION_LABEL, EMOTION_COLOR } from "@/lib/emotion";
import { loadSessions, type SavedSession } from "@/lib/sessionStore";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  const hh = `${d.getHours()}`.padStart(2, "0");
  const mm = `${d.getMinutes()}`.padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSessions(loadSessions());
    setLoaded(true);
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] pb-28 pt-6">
        <header className="flex items-center justify-between">
          <h1 className="text-[22px] font-extrabold">履歴</h1>
          <span className="text-[12px] font-bold text-[#8a8178]">
            {loaded ? `${sessions.length} 件` : "…"}
          </span>
        </header>

        <section className="flex flex-1 flex-col gap-3">
          {loaded && sessions.length === 0 && (
            <div className="rounded-[24px] border border-black/5 bg-white/85 p-6 text-center">
              <p className="mb-2 text-[15px] font-bold text-[#49433d]">
                まだ保存された会話はありません
              </p>
              <p className="text-[12px] leading-relaxed text-[#8a8178]">
                プロフィール画面で「セッションを保存する」をオンにすると、
                練習した会話がこの画面に並びます。すべて端末内に保存され、
                サーバーには送られません。
              </p>
              <Link
                href="/profile"
                className="mt-4 inline-block rounded-full bg-[#f4be42] px-5 py-2 text-[13px] font-extrabold text-[#2a241d]"
              >
                プロフィールへ
              </Link>
            </div>
          )}

          {sessions.map((s) => {
            const scene = SCENES.find((x) => x.id === s.sceneId);
            const character = scene ? CHARACTERS[scene.characterId] : null;
            const turns = s.messages.filter((m) => m.role === "user").length;
            const charMessages = s.messages.filter((m) => m.role === "character");
            const firstEmo = charMessages[0]?.emotion;
            const lastEmo =
              charMessages[charMessages.length - 1]?.emotion ?? firstEmo;
            const startDom = firstEmo ? dominant(firstEmo) : null;
            const endDom = lastEmo ? dominant(lastEmo) : null;

            return (
              <Link
                key={s.id}
                href={`/history/${s.id}`}
                className="block rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm transition active:scale-[0.99]"
              >
                <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-[#8a8178]">
                  <span>{formatDate(s.startedAt)}</span>
                  <span>{turns} ターン</span>
                </div>
                <h2 className="mb-1 text-[15px] font-extrabold text-[#49433d]">
                  {scene?.title ?? s.sceneId}
                </h2>
                {character && (
                  <p className="mb-3 text-[12px] font-bold text-[#6c665f]">
                    相手: {character.name}（{character.age}歳）
                  </p>
                )}
                <div className="flex items-center justify-between gap-2">
                  {startDom && endDom ? (
                    <div className="flex items-center gap-2 text-[12px] font-extrabold">
                      <span style={{ color: EMOTION_COLOR[startDom] }}>
                        {EMOTION_LABEL[startDom]}
                      </span>
                      <span className="text-[#9a938b]">→</span>
                      <span style={{ color: EMOTION_COLOR[endDom] }}>
                        {EMOTION_LABEL[endDom]}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[11px] font-bold text-[#8a8178]">
                      会話を見る
                    </span>
                  )}
                  <span
                    aria-hidden
                    className="text-[14px] font-extrabold text-[#9a938b]"
                  >
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
