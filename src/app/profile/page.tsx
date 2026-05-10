"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import {
  clearSessions,
  getEffectiveLines,
  getSettings,
  getStoryProgress,
  loadSessions,
  setSettings,
} from "@/lib/sessionStore";

export default function ProfilePage() {
  const [saveOn, setSaveOn] = useState(false);
  const [sessions, setSessions] = useState<ReturnType<typeof loadSessions>>([]);
  const [storyDone, setStoryDone] = useState<string[]>([]);
  const [effectiveCount, setEffectiveCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    setSaveOn(getSettings().saveSessions);
    setSessions(loadSessions());
    setStoryDone(getStoryProgress());
    setEffectiveCount(getEffectiveLines().length);
    setLoaded(true);
  }, []);

  const handleToggle = (v: boolean) => {
    setSaveOn(v);
    setSettings({ saveSessions: v });
  };

  const handleClear = () => {
    if (
      !window.confirm(
        "保存された会話の履歴をすべて削除します。よろしいですか？（取り消せません）"
      )
    ) {
      return;
    }
    clearSessions();
    setSessions([]);
  };

  // Practice stats derived from saved sessions. Total user-turn count is a
  // better "how much have I practiced" signal than session count alone, since
  // a single session can be 1 turn or 20 turns.
  const stats = useMemo(() => {
    const sessionCount = sessions.length;
    const totalUserTurns = sessions.reduce(
      (n, s) => n + s.messages.filter((m) => m.role === "user").length,
      0
    );
    const lastAt = sessions.reduce((m, s) => Math.max(m, s.endedAt ?? 0), 0);
    return { sessionCount, totalUserTurns, lastAt };
  }, [sessions]);

  const lastLabel = useMemo(() => {
    if (!stats.lastAt) return "まだ練習していません";
    const diffMs = Date.now() - stats.lastAt;
    const day = 86_400_000;
    if (diffMs < day) return "今日";
    if (diffMs < 2 * day) return "昨日";
    if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}日前`;
    const d = new Date(stats.lastAt);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }, [stats.lastAt]);

  const STORY_TOTAL = 30;
  const storyPct = Math.min(100, Math.round((storyDone.length / STORY_TOTAL) * 100));

  return (
    <main className="min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] pb-28 pt-6">
        <header>
          <h1 className="text-[22px] font-extrabold">プロフィール</h1>
          <p className="mt-1 text-[12px] font-bold text-[#8a8178]">
            あなたの練習の足跡。データはすべて端末内に保存されます。
          </p>
        </header>

        <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
          <h2 className="mb-3 text-[13px] font-extrabold text-[#49433d]">
            これまでの練習
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <StatCell
              label="セッション"
              value={loaded ? String(stats.sessionCount) : "…"}
              unit="回"
            />
            <StatCell
              label="話した数"
              value={loaded ? String(stats.totalUserTurns) : "…"}
              unit="ターン"
            />
            <StatCell
              label="響いたセリフ"
              value={loaded ? String(effectiveCount) : "…"}
              unit="個"
            />
          </div>

          <div className="mt-3 rounded-[16px] border border-black/5 bg-[#fafaf6] px-3 py-2.5">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-bold text-[#6c665f]">
                30日ストーリー
              </p>
              <p className="text-[12px] font-extrabold text-[#49433d]">
                {storyDone.length} / {STORY_TOTAL} 日
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full bg-[#f4be42] transition-all"
                style={{ width: `${storyPct}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[#8a8178]">
              最後の練習: {lastLabel}
            </p>
          </div>
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
          <h2 className="mb-3 text-[13px] font-extrabold text-[#49433d]">
            データ
          </h2>

          <label className="flex items-start gap-3 rounded-[16px] p-2 transition hover:bg-black/[0.02]">
            <input
              type="checkbox"
              checked={saveOn}
              onChange={(e) => handleToggle(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#f4be42]"
            />
            <div className="flex-1">
              <p className="text-[14px] font-extrabold text-[#49433d]">
                セッションを保存する
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#8a8178]">
                練習した会話を端末の localStorage に保存します。履歴・分析画面で見返せるようになります。
              </p>
            </div>
          </label>

          <div className="mt-3 flex items-center justify-between rounded-[16px] border border-black/5 bg-[#fafaf6] px-3 py-2.5">
            <div>
              <p className="text-[12px] font-bold text-[#6c665f]">保存件数</p>
              <p className="text-[15px] font-extrabold text-[#49433d]">
                {loaded ? `${stats.sessionCount} 件` : "…"}
              </p>
            </div>
            <button
              onClick={handleClear}
              type="button"
              disabled={stats.sessionCount === 0}
              className="rounded-full border border-[#c46b6b]/40 px-3 py-1.5 text-[12px] font-extrabold text-[#c46b6b] transition disabled:opacity-40"
            >
              全て削除
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setShowPrivacy(true)}
          className="mt-1 self-center text-[11px] font-bold text-[#9a938b] underline-offset-2 hover:underline active:text-[#6c665f]"
        >
          プライバシーポリシー
        </button>

        <BottomNav />

        {showPrivacy && (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center"
            onClick={() => setShowPrivacy(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] rounded-[24px] bg-white p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-[16px] font-extrabold text-[#2a241d]">
                  プライバシーポリシー
                </h2>
                <button
                  type="button"
                  onClick={() => setShowPrivacy(false)}
                  aria-label="閉じる"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[18px] text-[#8a8178] active:bg-black/[0.05]"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-[#5f5a53]">
                <p>
                  Qhat は、会話練習の内容を端末内（ブラウザの localStorage）にのみ保存します。サーバーには会話内容を残しません。
                </p>
                <p>
                  音声認識および応答生成のため、発話テキストは一時的に外部の音声認識／LLM サービスに送信されますが、Qhat 側では会話履歴を保持しません。
                </p>
                <p>
                  「データ」セクションのトグルで保存自体を停止できます。「全て削除」で端末内の履歴を完全に消去できます。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-[16px] border border-black/5 bg-[#fafaf6] px-2 py-2.5 text-center">
      <p className="text-[10px] font-bold text-[#8a8178]">{label}</p>
      <p className="mt-0.5 text-[20px] font-extrabold leading-none text-[#49433d]">
        {value}
        <span className="ml-0.5 text-[10px] font-bold text-[#8a8178]">{unit}</span>
      </p>
    </div>
  );
}
