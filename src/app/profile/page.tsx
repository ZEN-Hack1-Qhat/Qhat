"use client";

import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import {
  clearSessions,
  getSettings,
  loadSessions,
  setSettings,
} from "@/lib/sessionStore";

export default function ProfilePage() {
  const [saveOn, setSaveOn] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [apiMode, setApiMode] = useState<string | null>(null);

  useEffect(() => {
    setSaveOn(getSettings().saveSessions);
    setSavedCount(loadSessions().length);
    setLoaded(true);
    fetch("/api/turn")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.mode && setApiMode(d.mode))
      .catch(() => {});
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
    setSavedCount(0);
  };

  const modeLabel: Record<string, string> = {
    gemini: "Gemini 2.5 Flash",
    groq: "Groq Llama 3.3 70B",
    mock: "モック（テンプレ）",
  };

  return (
    <main className="min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] py-6">
        <header>
          <h1 className="text-[22px] font-extrabold">プロフィール</h1>
          <p className="mt-1 text-[12px] font-bold text-[#8a8178]">
            あなたの設定とアプリの状態。データはすべて端末内に保存されます。
          </p>
        </header>

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
                {loaded ? `${savedCount} 件` : "…"}
              </p>
            </div>
            <button
              onClick={handleClear}
              type="button"
              disabled={savedCount === 0}
              className="rounded-full border border-[#c46b6b]/40 px-3 py-1.5 text-[12px] font-extrabold text-[#c46b6b] transition disabled:opacity-40"
            >
              全て削除
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
          <h2 className="mb-3 text-[13px] font-extrabold text-[#49433d]">
            アプリの状態
          </h2>
          <div className="flex items-center justify-between text-[12px] font-bold">
            <span className="text-[#6c665f]">応答エンジン</span>
            <span className="text-[#49433d]">
              {apiMode ? modeLabel[apiMode] ?? apiMode : "確認中…"}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#8a8178]">
            Gemini が利用できないときは Groq が、それも使えないときはローカルのモックが応答します。
          </p>
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white/85 p-4 shadow-sm">
          <h2 className="mb-2 text-[13px] font-extrabold text-[#49433d]">
            Qhat について
          </h2>
          <p className="text-[12px] leading-relaxed text-[#6c665f]">
            会話のリハーサルアプリ。本番前に、安全に何度でもやり直せます。
            相手の感情は4つの状態（喜・安・不・戸）の重ね合わせとして可視化されます。
          </p>
        </section>

        <BottomNav />
      </div>
    </main>
  );
}
