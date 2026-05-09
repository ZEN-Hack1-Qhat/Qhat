"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScene } from "@/lib/scenes";
import { CHARACTERS } from "@/lib/characters";
import { dominant, EMOTION_LABEL } from "@/lib/emotion";
import { speak, useSpeechRecognition } from "@/lib/speech";
import type { Emotion, EmotionProbs, Message, TurnResponse } from "@/lib/types";

const fallbackEmotion: EmotionProbs = {
  joy: 0.18,
  calm: 0.35,
  anxiety: 0.32,
  confusion: 0.15,
};

const emotionUI: Record<
  Emotion,
  {
    color: string;
    fill: string;
    glow: string;
    blob: string;
    helper: string;
    mouth: "smile" | "happy" | "sad" | "flat";
  }
> = {
  joy: {
    color: "#e2a51b",
    fill: "linear-gradient(90deg, #ffd86a, #f5a623)",
    glow: "rgba(255, 210, 90, 0.28)",
    blob:
      "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.75), transparent 24%), linear-gradient(180deg, #ffe37a, #ffb13b)",
    helper: "少し楽しそう。話しやすい空気になってきたかも。",
    mouth: "happy",
  },
  calm: {
    color: "#3d8f54",
    fill: "linear-gradient(90deg, #7edb95, #47bd68)",
    glow: "rgba(89, 194, 116, 0.24)",
    blob:
      "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.7), transparent 24%), linear-gradient(180deg, #ffd96f, #f4b93b)",
    helper: "無理にうまく話さなくても大丈夫。少しずつでいいよ。",
    mouth: "smile",
  },
  anxiety: {
    color: "#c46b6b",
    fill: "linear-gradient(90deg, #ffaaa5, #e57373)",
    glow: "rgba(229, 115, 115, 0.24)",
    blob:
      "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.65), transparent 24%), linear-gradient(180deg, #ffb0a8, #e87a7a)",
    helper: "少し緊張しているみたい。ゆっくり言葉を選んで大丈夫。",
    mouth: "sad",
  },
  confusion: {
    color: "#7b68b6",
    fill: "linear-gradient(90deg, #c7b8ff, #8f7ae6)",
    glow: "rgba(143, 122, 230, 0.22)",
    blob:
      "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.65), transparent 24%), linear-gradient(180deg, #c8bbff, #8d7be8)",
    helper: "少し戸惑っているかも。短く言い直してみると伝わりやすい。",
    mouth: "flat",
  },
};

const PROACTIVE_IDLE_MS = 9000;
const PROACTIVE_COOLDOWN_MS = 16000;
const PROACTIVE_MAX = 3;

export default function HomePage() {
  const scene = useMemo(
    () => getScene("custom") ?? getScene("kanto_offline"),
    []
  );
  const character = scene ? CHARACTERS[scene.characterId] : null;

  const [text, setText] = useState("");
  const [emotion, setEmotion] = useState<EmotionProbs>(
    scene?.initialEmotion ?? fallbackEmotion
  );
  const [messages, setMessages] = useState<Message[]>(
    scene?.openingLine
      ? [
          {
            id: "opening",
            role: "character",
            text: scene.openingLine,
            speaker: scene.characterId,
            timestamp: Date.now(),
            emotion: scene.initialEmotion,
            dominant: dominant(scene.initialEmotion),
          },
        ]
      : []
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [lastProactiveAt, setLastProactiveAt] = useState(0);
  const [proactiveCount, setProactiveCount] = useState(0);
  const [proactiveEnabled] = useState(true);

  const latestTextRef = useRef("");

  const dom = dominant(emotion);
  const ui = emotionUI[dom];
  const percent = Math.round((emotion[dom] ?? 0) * 100);

  const lastCharacterMessage = [...messages]
    .reverse()
    .find((m) => m.role === "character");

  const lastMessage =
    lastCharacterMessage?.text ?? "こんにちは、どんな会話を練習しますか？";

  const silentSeconds = Math.max(0, (now - lastInteractionAt) / 1000);
  const willProactive =
    proactiveEnabled &&
    !loading &&
    silentSeconds >= PROACTIVE_IDLE_MS / 1000 - 3 &&
    proactiveCount < PROACTIVE_MAX;

  const send = useCallback(
    async (overrideText?: string, opts?: { proactive?: boolean }) => {
      if (!scene || !character || loading) return;

      const userText = (overrideText ?? latestTextRef.current ?? text).trim();

      if (!opts?.proactive && !userText) return;

      setError("");

      let nextHistory = messages;

      if (!opts?.proactive) {
        const userMessage: Message = {
          id: `user_${Date.now()}`,
          role: "user",
          text: userText,
          timestamp: Date.now(),
        };

        nextHistory = [...messages, userMessage];
        setMessages(nextHistory);
        setText("");
        latestTextRef.current = "";
      }

      setLoading(true);
      setLastInteractionAt(Date.now());

      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_text: userText,
            prev_emotion: emotion,
            character_id: scene.characterId,
            scene_id: scene.id,
            history: nextHistory.slice(-40),
            key_facts: [],
            redo_count: 0,
            proactive: opts?.proactive === true,
          }),
        });

        const data = (await res.json()) as Partial<TurnResponse> & {
          error?: string;
        };

        if (!res.ok || !data.characterMessage) {
          setError(data.error ?? "返答の取得に失敗しました");
          return;
        }

        const nextEmotion = data.characterMessage.emotion ?? emotion;

        setEmotion(nextEmotion);
        setMessages((prev) => [...prev, data.characterMessage!]);
        setLastInteractionAt(Date.now());

        speak(data.characterMessage.text, {
          ...character.voice,
        });
      } catch (e) {
        console.error(e);
        setError("通信に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [scene, character, loading, text, messages, emotion]
  );

  const recognition = useSpeechRecognition({
    onInterim: (t) => {
      latestTextRef.current = t;
      setText(t);
    },
    onFinal: (t) => {
      latestTextRef.current = t;
      setText(t);
    },
  });

  const handleMic = async () => {
    if (recognition.running) {
      recognition.stop();
      return;
    }

    latestTextRef.current = "";
    setText("");
    recognition.resetFinal();
    await recognition.start();
  };

  const setHint = (hint: string) => {
    latestTextRef.current = hint;
    setText(hint);
  };

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!proactiveEnabled) return;
    if (loading) return;
    if (text.trim()) return;
    if (proactiveCount >= PROACTIVE_MAX) return;

    const idle = Date.now() - lastInteractionAt;
    const cooldown = Date.now() - lastProactiveAt;

    if (idle >= PROACTIVE_IDLE_MS && cooldown >= PROACTIVE_COOLDOWN_MS) {
      setProactiveCount((v) => v + 1);
      setLastProactiveAt(Date.now());
      send("", { proactive: true });
    }
  }, [
    now,
    loading,
    text,
    proactiveCount,
    lastInteractionAt,
    lastProactiveAt,
    proactiveEnabled,
    send,
  ]);

  if (!scene || !character) return null;

  return (
    <main className="min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] py-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[25px] font-extrabold">
            <img
              src="/logo.png"
              alt="Qhat"
              className="h-12 w-12 object-contain"
            />
            <span>Qhat</span>
          </div>

          <div className="rounded-full border border-black/5 bg-white/80 px-4 py-2 text-[13px] font-bold text-[#6c665f] backdrop-blur">
            {willProactive ? "そろそろ話しかけそう" : "今日は少し練習日和"}
          </div>
        </header>

        <section className="relative flex flex-1 flex-col items-center justify-center pt-2">
          <div
            className="absolute h-[240px] w-[240px] rounded-full blur-lg transition-all duration-700"
            style={{
              background: `radial-gradient(circle, ${ui.glow}, transparent 68%)`,
            }}
          />

          <div className="relative z-10 flex flex-col items-center gap-[18px]">
            <div
              className={`relative h-[190px] w-[190px] transition-all duration-700 ${
                dom === "joy"
                  ? "animate-[bounce_1.8s_ease-in-out_infinite]"
                  : dom === "anxiety"
                  ? "animate-[pulse_1.2s_ease-in-out_infinite]"
                  : "animate-[floaty_3.8s_ease-in-out_infinite]"
              }`}
              style={{
                borderRadius: "42% 42% 38% 38% / 46% 46% 54% 54%",
                background: ui.blob,
                boxShadow: `0 24px 44px ${ui.glow}, inset 0 -10px 20px rgba(255,255,255,0.12)`,
              }}
            >
              {silentSeconds >= 5 && (
                <div className="absolute right-[-10px] top-3 flex items-center gap-1 rounded-full border border-black/5 bg-white/80 px-2.5 py-2 shadow-sm backdrop-blur">
                  <span className="thinking-dot" />
                  <span className="thinking-dot delay-150" />
                  <span className="thinking-dot delay-300" />
                </div>
              )}

              <div className="absolute left-[62px] top-[78px] h-7 w-2.5 rounded-full bg-[#2a241d]" />
              <div className="absolute right-[62px] top-[78px] h-7 w-2.5 rounded-full bg-[#2a241d]" />

              <div
                className="absolute left-1/2 top-[116px] -translate-x-1/2"
                style={
                  ui.mouth === "happy"
                    ? {
                        width: 42,
                        height: 20,
                        borderBottom: "6px solid #2a241d",
                        borderRadius: "0 0 999px 999px",
                      }
                    : ui.mouth === "sad"
                    ? {
                        width: 34,
                        height: 16,
                        borderTop: "5px solid #2a241d",
                        borderRadius: "999px 999px 0 0",
                      }
                    : ui.mouth === "flat"
                    ? {
                        width: 30,
                        height: 5,
                        background: "#2a241d",
                        borderRadius: 999,
                      }
                    : {
                        width: 34,
                        height: 16,
                        borderBottom: "5px solid #2a241d",
                        borderRadius: "0 0 999px 999px",
                      }
                }
              />
            </div>

            <div className="w-[190px] rounded-[18px] border border-black/5 bg-white/80 px-3 py-2.5 shadow-sm backdrop-blur">
              {silentSeconds >= 3 && (
                <div className="mb-1.5 text-center text-[11px] font-bold text-[#8a8178]">
                  間 {silentSeconds.toFixed(1)}s
                  {willProactive ? " ・ そろそろ話すかも" : ""}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-sm font-extrabold text-[#5f5a53]">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: ui.color,
                      boxShadow: `0 0 12px ${ui.color}`,
                    }}
                  />
                  <span>{EMOTION_LABEL[dom]}</span>
                </div>
                <span style={{ color: ui.color }}>{percent}%</span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${percent}%`,
                    background: ui.fill,
                  }}
                />
              </div>
            </div>

            <div className="max-w-[300px] rounded-[26px] border border-black/5 bg-white/85 px-5 py-4 text-center text-[17px] font-bold leading-relaxed text-[#49433d] shadow-sm backdrop-blur">
              {loading ? "考え中…" : lastMessage}
            </div>

            <p className="max-w-[300px] text-center text-xs font-bold leading-relaxed text-[#8a8178]">
              {ui.helper}
            </p>
          </div>
        </section>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            "初対面って緊張する",
            "何話せばいいかわからない",
            "返事の仕方を練習したい",
          ].map((item) => (
            <button
              key={item}
              onClick={() => setHint(item)}
              className="shrink-0 rounded-full border border-black/5 bg-white/80 px-3.5 py-2.5 text-[13px] font-bold text-[#6f675e] shadow-sm"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-[28px] border border-black/5 bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur">
          <button
            onClick={handleMic}
            type="button"
            className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[#fff3d2] text-xl ${
              recognition.running ? "animate-pulse" : ""
            }`}
          >
            🎤
          </button>

          <input
            value={text}
            onChange={(e) => {
              latestTextRef.current = e.target.value;
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder={recognition.running ? "聞いています…" : "話しかけてみる…"}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#49433d] outline-none placeholder:text-[#9c958d]"
          />

          <button
            onClick={() => send()}
            disabled={loading || !text.trim()}
            type="button"
            className="h-11 rounded-full bg-[#f4be42] px-[18px] text-[15px] font-extrabold text-[#2a241d] shadow-sm disabled:opacity-40"
          >
            話す
          </button>
        </div>

        {error && <p className="text-center text-xs text-red-500">{error}</p>}

        <nav className="mt-auto grid grid-cols-4 rounded-[24px] border border-black/5 bg-white/90 px-2 py-3 shadow-sm backdrop-blur">
          <div className="text-center text-[11px] font-bold text-[#efb128]">
            <span className="mb-0.5 block text-xl">💬</span>
            ホーム
          </div>
          <div className="text-center text-[11px] font-bold text-[#9a938b]">
            <span className="mb-0.5 block text-xl">🕘</span>
            履歴
          </div>
          <div className="text-center text-[11px] font-bold text-[#9a938b]">
            <span className="mb-0.5 block text-xl">📊</span>
            分析
          </div>
          <div className="text-center text-[11px] font-bold text-[#9a938b]">
            <span className="mb-0.5 block text-xl">👤</span>
            プロフィール
          </div>
        </nav>
      </div>

      <style jsx global>{`
        @keyframes floaty {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        .thinking-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #d3b26a;
          animation: thinking 1.4s infinite ease-in-out;
        }

        @keyframes thinking {
          0%,
          100% {
            transform: translateY(0px);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}





// "use client";

// import { useCallback, useMemo, useRef, useState } from "react";
// import { getScene } from "@/lib/scenes";
// import type { Emotion, EmotionProbs, Message, TurnResponse } from "@/lib/types";
// import { dominant, EMOTION_LABEL } from "@/lib/emotion";
// import { useSpeechRecognition, speak } from "@/lib/speech";
// import { CHARACTERS } from "@/lib/characters";

// const fallbackEmotion: EmotionProbs = {
//   joy: 0.18,
//   calm: 0.35,
//   anxiety: 0.32,
//   confusion: 0.15,
// };

// const emotionUI: Record<
//   Emotion,
//   {
//     emoji: string;
//     color: string;
//     fill: string;
//     glow: string;
//     message: string;
//     face: string;
//   }
// > = {
//   joy: {
//     emoji: "😊",
//     color: "#e2a51b",
//     fill: "linear-gradient(90deg, #ffd86a, #f5a623)",
//     glow: "rgba(255, 210, 90, 0.28)",
//     message: "少し楽しそう。話しやすい空気になってきたかも。",
//     face: "joy",
//   },
//   calm: {
//     emoji: "🙂",
//     color: "#3d8f54",
//     fill: "linear-gradient(90deg, #7edb95, #47bd68)",
//     glow: "rgba(89, 194, 116, 0.24)",
//     message: "無理にうまく話さなくても大丈夫。少しずつでいいよ。",
//     face: "calm",
//   },
//   anxiety: {
//     emoji: "😟",
//     color: "#c46b6b",
//     fill: "linear-gradient(90deg, #ffaaa5, #e57373)",
//     glow: "rgba(229, 115, 115, 0.24)",
//     message: "少し緊張しているみたい。ゆっくり言葉を選んで大丈夫。",
//     face: "anxiety",
//   },
//   confusion: {
//     emoji: "😶",
//     color: "#7b68b6",
//     fill: "linear-gradient(90deg, #c7b8ff, #8f7ae6)",
//     glow: "rgba(143, 122, 230, 0.22)",
//     message: "少し戸惑っているかも。短く言い直してみると伝わりやすい。",
//     face: "confusion",
//   },
// };

// export default function HomePage() {
//   const scene = useMemo(
//     () => getScene("custom") ?? getScene("kanto_offline"),
//     []
//   );

//   const character = scene ? CHARACTERS[scene.characterId] : null;

//   const [text, setText] = useState("");
//   const [emotion, setEmotion] = useState<EmotionProbs>(
//     scene?.initialEmotion ?? fallbackEmotion
//   );
//   const [messages, setMessages] = useState<Message[]>(
//     scene?.openingLine
//       ? [
//           {
//             id: "opening",
//             role: "character",
//             text: scene.openingLine,
//             speaker: scene.characterId,
//             timestamp: Date.now(),
//             emotion: scene.initialEmotion,
//             dominant: dominant(scene.initialEmotion),
//           },
//         ]
//       : []
//   );

//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState("");

//   const latestTextRef = useRef("");

//   const dom = dominant(emotion);
//   const ui = emotionUI[dom];
//   const percent = Math.round((emotion[dom] ?? 0) * 100);

//   const lastCharacterMessage = [...messages]
//     .reverse()
//     .find((m) => m.role === "character");

//   const lastMessage =
//     lastCharacterMessage?.text ?? "こんにちは、どんな会話を練習しますか？";

//   const send = useCallback(
//     async (overrideText?: string) => {
//       if (!scene || !character || loading) return;

//       const userText = (overrideText ?? latestTextRef.current ?? text).trim();
//       if (!userText) return;

//       setError("");

//       const userMessage: Message = {
//         id: `user_${Date.now()}`,
//         role: "user",
//         text: userText,
//         timestamp: Date.now(),
//       };

//       const nextHistory = [...messages, userMessage];

//       setMessages(nextHistory);
//       setText("");
//       latestTextRef.current = "";
//       setLoading(true);

//       try {
//         const res = await fetch("/api/turn", {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             user_text: userText,
//             prev_emotion: emotion,
//             character_id: scene.characterId,
//             scene_id: scene.id,
//             history: nextHistory.slice(-40),
//             key_facts: [],
//             redo_count: 0,
//           }),
//         });

//         const data = (await res.json()) as Partial<TurnResponse> & {
//           error?: string;
//         };

//         if (!res.ok || !data.characterMessage) {
//           setError(data.error ?? "返答の取得に失敗しました");
//           return;
//         }

//         const nextEmotion = data.characterMessage.emotion ?? emotion;

//         setEmotion(nextEmotion);
//         setMessages((prev) => [...prev, data.characterMessage!]);

//         speak(data.characterMessage.text, {
//           ...character.voice,
//         });
//       } catch (e) {
//         console.error(e);
//         setError("通信に失敗しました");
//       } finally {
//         setLoading(false);
//       }
//     },
//     [scene, character, loading, text, messages, emotion]
//   );

//   const recognition = useSpeechRecognition({
//     onInterim: (t) => {
//       latestTextRef.current = t;
//       setText(t);
//     },
//     onFinal: (t) => {
//       latestTextRef.current = t;
//       setText(t);
//     },
//   });

//   const handleMic = async () => {
//     if (recognition.running) {
//       recognition.stop();
//       return;
//     }

//     latestTextRef.current = "";
//     setText("");
//     recognition.resetFinal();
//     await recognition.start();
//   };

//   const setHint = (hint: string) => {
//     latestTextRef.current = hint;
//     setText(hint);
//   };

//   if (!scene || !character) return null;

//   return (
//     <main className="min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
//       <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] py-6">
//         <header className="flex items-center justify-between">
//           <div className="flex items-center gap-2.5 text-[25px] font-extrabold">
//             <img
//               src="/logo.png"
//               alt="Qhat"
//               className="h-12 w-12 object-contain"
//             />
//             <span>Qhat</span>
//           </div>

//           <div className="rounded-full border border-black/5 bg-white/80 px-4 py-2 text-[13px] font-bold text-[#6c665f] backdrop-blur">
//             {EMOTION_LABEL[dom]} {percent}%
//           </div>
//         </header>

//         <section className="relative flex flex-1 flex-col items-center justify-center pt-2">
//           <div
//             className="absolute h-[240px] w-[240px] rounded-full blur-lg transition-all duration-700"
//             style={{
//               background: `radial-gradient(circle, ${ui.glow}, transparent 68%)`,
//             }}
//           />

//           <div className="relative z-10 flex flex-col items-center gap-[18px]">
//             <div
//               className={`relative h-[190px] w-[190px] transition-all duration-700 ${
//                 dom === "joy"
//                   ? "animate-[bounce_1.8s_ease-in-out_infinite]"
//                   : dom === "anxiety"
//                   ? "animate-[pulse_1.2s_ease-in-out_infinite]"
//                   : "animate-[floaty_3.8s_ease-in-out_infinite]"
//               }`}
//               style={{
//                 borderRadius: "42% 42% 38% 38% / 46% 46% 54% 54%",
//                 background:
//                   dom === "calm"
//                     ? "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.7), transparent 24%), linear-gradient(180deg, #ffd96f, #f4b93b)"
//                     : dom === "joy"
//                     ? "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.75), transparent 24%), linear-gradient(180deg, #ffe37a, #ffb13b)"
//                     : dom === "anxiety"
//                     ? "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.65), transparent 24%), linear-gradient(180deg, #ffb0a8, #e87a7a)"
//                     : "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.65), transparent 24%), linear-gradient(180deg, #c8bbff, #8d7be8)",
//                 boxShadow: `0 24px 44px ${ui.glow}, inset 0 -10px 20px rgba(255,255,255,0.12)`,
//               }}
//             >
//               <div className="absolute left-[62px] top-[78px] h-7 w-2.5 rounded-full bg-[#2a241d]" />
//               <div className="absolute right-[62px] top-[78px] h-7 w-2.5 rounded-full bg-[#2a241d]" />

//               <div
//                 className="absolute left-1/2 top-[116px] -translate-x-1/2"
//                 style={
//                   dom === "joy"
//                     ? {
//                         width: 42,
//                         height: 20,
//                         borderBottom: "6px solid #2a241d",
//                         borderRadius: "0 0 999px 999px",
//                       }
//                     : dom === "anxiety"
//                     ? {
//                         width: 34,
//                         height: 16,
//                         borderTop: "5px solid #2a241d",
//                         borderRadius: "999px 999px 0 0",
//                       }
//                     : dom === "confusion"
//                     ? {
//                         width: 30,
//                         height: 5,
//                         background: "#2a241d",
//                         borderRadius: 999,
//                       }
//                     : {
//                         width: 34,
//                         height: 16,
//                         borderBottom: "5px solid #2a241d",
//                         borderRadius: "0 0 999px 999px",
//                       }
//                 }
//               />
//             </div>

//             <div className="w-[176px] rounded-[18px] border border-black/5 bg-white/80 px-3 py-2.5 shadow-[0_8px_22px_rgba(0,0,0,0.055)] backdrop-blur">
//               <div className="flex items-center justify-between gap-2 text-sm font-extrabold text-[#5f5a53]">
//                 <div className="flex items-center gap-2">
//                   <div
//                     className="h-2.5 w-2.5 rounded-full"
//                     style={{
//                       background: ui.color,
//                       boxShadow: `0 0 12px ${ui.color}`,
//                     }}
//                   />
//                   <span>{EMOTION_LABEL[dom]}</span>
//                 </div>
//                 <span style={{ color: ui.color }}>{percent}%</span>
//               </div>

//               <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
//                 <div
//                   className="h-full rounded-full transition-all duration-700"
//                   style={{
//                     width: `${percent}%`,
//                     background: ui.fill,
//                   }}
//                 />
//               </div>
//             </div>

//             <div className="max-w-[300px] rounded-[26px] border border-black/5 bg-white/85 px-5 py-4 text-center text-[17px] font-bold leading-relaxed text-[#49433d] shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur">
//               {loading ? "考え中…" : lastMessage}
//             </div>

//             <p className="max-w-[300px] text-center text-xs font-bold leading-relaxed text-[#8a8178]">
//               {ui.message}
//             </p>
//           </div>
//         </section>

//         <div className="flex gap-2 overflow-x-auto pb-1">
//           {[
//             "初対面って緊張する",
//             "何話せばいいかわからない",
//             "返事の仕方を練習したい",
//           ].map((item) => (
//             <button
//               key={item}
//               onClick={() => setHint(item)}
//               className="shrink-0 rounded-full border border-black/5 bg-white/80 px-3.5 py-2.5 text-[13px] font-bold text-[#6f675e] shadow-sm"
//             >
//               {item}
//             </button>
//           ))}
//         </div>

//         <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-[28px] border border-black/5 bg-white/90 px-3.5 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.08)] backdrop-blur">
//           <button
//             onClick={handleMic}
//             type="button"
//             className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-[#fff3d2] text-xl ${
//               recognition.running ? "animate-pulse" : ""
//             }`}
//           >
//             🎤
//           </button>

//           <input
//             value={text}
//             onChange={(e) => {
//               latestTextRef.current = e.target.value;
//               setText(e.target.value);
//             }}
//             onKeyDown={(e) => {
//               if (e.key === "Enter") send();
//             }}
//             placeholder={recognition.running ? "聞いています…" : "話しかけてみる…"}
//             className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#49433d] outline-none placeholder:text-[#9c958d]"
//           />

//           <button
//             onClick={() => send()}
//             disabled={loading || !text.trim()}
//             type="button"
//             className="h-11 rounded-full bg-[#f4be42] px-[18px] text-[15px] font-extrabold text-[#2a241d] shadow-[0_8px_18px_rgba(244,190,66,0.25)] disabled:opacity-40"
//           >
//             話す
//           </button>
//         </div>

//         {error && <p className="text-center text-xs text-red-500">{error}</p>}

//         <nav className="mt-auto grid grid-cols-4 rounded-[24px] border border-black/5 bg-white/90 px-2 py-3 shadow-[0_-4px_22px_rgba(0,0,0,0.06)] backdrop-blur">
//           <div className="text-center text-[11px] font-bold text-[#efb128]">
//             <span className="mb-0.5 block text-xl">💬</span>
//             ホーム
//           </div>
//           <div className="text-center text-[11px] font-bold text-[#9a938b]">
//             <span className="mb-0.5 block text-xl">🕘</span>
//             履歴
//           </div>
//           <div className="text-center text-[11px] font-bold text-[#9a938b]">
//             <span className="mb-0.5 block text-xl">📊</span>
//             分析
//           </div>
//           <div className="text-center text-[11px] font-bold text-[#9a938b]">
//             <span className="mb-0.5 block text-xl">👤</span>
//             プロフィール
//           </div>
//         </nav>
//       </div>

//       <style jsx global>{`
//         @keyframes floaty {
//           0%,
//           100% {
//             transform: translateY(0px);
//           }
//           50% {
//             transform: translateY(-10px);
//           }
//         }
//       `}</style>
//     </main>
//   );
// }





// // "use client";

// // import { useCallback, useMemo, useRef, useState } from "react";
// // import { getScene } from "@/lib/scenes";
// // import type { EmotionProbs, Message, TurnResponse } from "@/lib/types";
// // import { dominant, EMOTION_LABEL } from "@/lib/emotion";
// // import { useSpeechRecognition, speak } from "@/lib/speech";
// // import { CHARACTERS } from "@/lib/characters";

// // const fallbackEmotion: EmotionProbs = {
// //   joy: 0.18,
// //   calm: 0.35,
// //   anxiety: 0.32,
// //   confusion: 0.15,
// // };

// // export default function HomePage() {
// //   const scene = useMemo(
// //     () => getScene("custom") ?? getScene("kanto_offline"),
// //     []
// //   );

// //   const character = scene ? CHARACTERS[scene.characterId] : null;

// //   const [text, setText] = useState("");
// //   const [emotion, setEmotion] = useState<EmotionProbs>(
// //     scene?.initialEmotion ?? fallbackEmotion
// //   );
// //   const [messages, setMessages] = useState<Message[]>(
// //     scene?.openingLine
// //       ? [
// //           {
// //             id: "opening",
// //             role: "character",
// //             text: scene.openingLine,
// //             speaker: scene.characterId,
// //             timestamp: Date.now(),
// //             emotion: scene.initialEmotion,
// //             dominant: dominant(scene.initialEmotion),
// //           },
// //         ]
// //       : []
// //   );

// //   const [loading, setLoading] = useState(false);
// //   const [isSpeaking, setIsSpeaking] = useState(false);
// //   const [error, setError] = useState("");

// //   const latestTextRef = useRef("");

// //   const lastCharacterMessage = [...messages]
// //     .reverse()
// //     .find((m) => m.role === "character");

// //   const lastMessage =
// //     lastCharacterMessage?.text ?? "こんにちは、初めてですか？";

// //   const dom = dominant(emotion);
// //   const domPercent = Math.round((emotion[dom] ?? 0) * 100);

// //   const send = useCallback(
// //     async (overrideText?: string) => {
// //       if (!scene || !character || loading) return;

// //       const userText = (overrideText ?? latestTextRef.current ?? text).trim();
// //       if (!userText) return;

// //       setError("");

// //       const userMessage: Message = {
// //         id: `user_${Date.now()}`,
// //         role: "user",
// //         text: userText,
// //         timestamp: Date.now(),
// //       };

// //       const nextHistory = [...messages, userMessage];

// //       setMessages(nextHistory);
// //       setText("");
// //       latestTextRef.current = "";
// //       setLoading(true);

// //       try {
// //         const res = await fetch("/api/turn", {
// //           method: "POST",
// //           headers: { "Content-Type": "application/json" },
// //           body: JSON.stringify({
// //             user_text: userText,
// //             prev_emotion: emotion,
// //             character_id: scene.characterId,
// //             scene_id: scene.id,
// //             history: nextHistory.slice(-40),
// //             key_facts: [],
// //             redo_count: 0,
// //           }),
// //         });

// //         const data = (await res.json()) as Partial<TurnResponse> & {
// //           error?: string;
// //         };

// //         if (!res.ok || !data.characterMessage) {
// //           console.error("API error:", data);
// //           setError(data.error ?? "返答の取得に失敗しました");
// //           return;
// //         }

// //         const nextEmotion = data.characterMessage.emotion ?? emotion;
// //         setEmotion(nextEmotion);
// //         setMessages((prev) => [...prev, data.characterMessage!]);

// //         setIsSpeaking(true);
// //         speak(data.characterMessage.text, {
// //           ...character.voice,
// //           onEnd: () => setIsSpeaking(false),
// //           onError: () => setIsSpeaking(false),
// //         });
// //       } catch (e) {
// //         console.error(e);
// //         setError("通信に失敗しました");
// //       } finally {
// //         setLoading(false);
// //       }
// //     },
// //     [scene, character, loading, text, messages, emotion]
// //   );

// //   const recognition = useSpeechRecognition({
// //     onInterim: (t) => {
// //       latestTextRef.current = t;
// //       setText(t);
// //     },
// //     onFinal: (t) => {
// //       latestTextRef.current = t;
// //       setText(t);
// //     },
// //   });

// //   const handleMic = async () => {
// //     if (recognition.running) {
// //       recognition.stop();
// //       return;
// //     }

// //     latestTextRef.current = "";
// //     setText("");
// //     recognition.resetFinal();
// //     await recognition.start();
// //   };

// //   const handleQuickStart = () => {
// //     const firstLine = "こんにちは、初めてです。";
// //     latestTextRef.current = firstLine;
// //     setText(firstLine);
// //     send(firstLine);
// //   };

// //   const handleHint = (hint: string) => {
// //     latestTextRef.current = hint;
// //     setText(hint);
// //   };

// //   if (!scene || !character) {
// //     return <main>Scene not found</main>;
// //   }

// //   return (
// //     <main className="min-h-screen bg-[#FAFAF7] text-[#1A1A1A]">
// //       <div className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-8">
// //         <header className="mb-8 flex items-center justify-between">
// //           <div className="flex items-center gap-3">
// //             <img
// //               src="/logo.png"
// //               alt="Qhat"
// //               className="h-14 w-14 rounded-xl object-cover"
// //             />
// //             <h1 className="text-3xl font-bold">Qhat</h1>
// //           </div>

// //           <div className="rounded-2xl border border-black/10 bg-white px-4 py-2 text-sm font-bold shadow-sm">
// //             ⭐ Lv.1
// //           </div>
// //         </header>

// //         <section className="flex flex-1 flex-col items-center">
// //           <div className="mb-8 rounded-3xl border border-black/10 bg-white px-8 py-5 text-center text-xl font-bold shadow-sm">
// //             {loading ? "考え中…" : lastMessage}
// //           </div>

// //           <div className="mb-8 flex h-48 w-48 items-center justify-center rounded-[42%] bg-[#FFD56A] shadow-xl">
// //             <div className="text-5xl">
// //               {dom === "joy"
// //                 ? "😊"
// //                 : dom === "calm"
// //                 ? "🙂"
// //                 : dom === "anxiety"
// //                 ? "😟"
// //                 : "😶"}
// //             </div>
// //           </div>

// //           <div className="mb-8 w-full rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
// //             <p className="mb-2 text-sm text-gray-500">現在の感情</p>
// //             <div className="flex items-center gap-3">
// //               <span className="text-2xl">
// //                 {dom === "joy"
// //                   ? "😊"
// //                   : dom === "calm"
// //                   ? "🙂"
// //                   : dom === "anxiety"
// //                   ? "😟"
// //                   : "😶"}
// //               </span>
// //               <span className="text-xl font-bold text-green-600">
// //                 {EMOTION_LABEL[dom]}
// //               </span>
// //             </div>

// //             <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
// //               <div
// //                 className="h-full rounded-full bg-green-500"
// //                 style={{ width: `${domPercent}%` }}
// //               />
// //             </div>

// //             <p className="mt-2 text-sm font-bold">{domPercent}%</p>
// //           </div>

// //           <div className="mb-3 flex w-full items-center gap-3 rounded-full border border-black/10 bg-white px-5 py-4 shadow-sm">
// //             <button
// //               onClick={handleMic}
// //               className={`text-2xl ${
// //                 recognition.running ? "animate-pulse" : ""
// //               }`}
// //               type="button"
// //             >
// //               🎤
// //             </button>

// //             <input
// //               value={text}
// //               onChange={(e) => {
// //                 latestTextRef.current = e.target.value;
// //                 setText(e.target.value);
// //               }}
// //               onKeyDown={(e) => {
// //                 if (e.key === "Enter") send();
// //               }}
// //               placeholder={
// //                 recognition.running
// //                   ? "聞いています…"
// //                   : "あなたのセリフを入力"
// //               }
// //               className="flex-1 bg-transparent text-sm outline-none"
// //             />

// //             <button
// //               onClick={() => send()}
// //               disabled={loading || !text.trim()}
// //               className="rounded-full bg-[#F6C64D] px-5 py-3 font-bold text-black disabled:opacity-40"
// //               type="button"
// //             >
// //               話す
// //             </button>
// //           </div>

// //           {!recognition.supported && (
// //             <p className="mb-3 text-xs text-red-500">
// //               このブラウザは音声認識に未対応です。Chromeで開いてください。
// //             </p>
// //           )}

// //           {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

// //           <div className="mb-8 grid w-full grid-cols-[1fr_140px] gap-3">
// //             <button
// //               onClick={handleQuickStart}
// //               disabled={loading}
// //               className="rounded-2xl bg-[#F6C64D] py-4 text-center text-lg font-bold shadow-sm disabled:opacity-40"
// //               type="button"
// //             >
// //               ▶ すぐ始める
// //             </button>

// //             <button
// //               className="rounded-2xl border border-black/10 bg-white py-4 font-bold shadow-sm"
// //               type="button"
// //             >
// //               続きから
// //             </button>
// //           </div>

// //           <section className="w-full">
// //             <h2 className="mb-3 text-sm font-bold text-gray-600">
// //               シーンのヒント
// //             </h2>

// //             <div className="grid grid-cols-2 gap-3">
// //               {[
// //                 ["オフ会", "初対面", "初対面の人に話しかける練習をしたいです"],
// //                 [
// //                   "面接前",
// //                   "控え室で",
// //                   "面接前の控え室で会話する練習をしたいです",
// //                 ],
// //                 ["先輩対応", "返事をする", "先輩に返事をする練習をしたいです"],
// //                 [
// //                   "＋ 自由に設定",
// //                   "自分の場面で練習",
// //                   "自分で決めた場面で会話練習をしたいです",
// //                 ],
// //               ].map(([label, sub, prompt]) => (
// //                 <button
// //                   key={label}
// //                   onClick={() => handleHint(prompt)}
// //                   className="rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition hover:scale-[1.02]"
// //                   type="button"
// //                 >
// //                   <p className="font-bold">{label}</p>
// //                   <p className="mt-1 text-xs text-gray-500">{sub}</p>
// //                 </button>
// //               ))}
// //             </div>
// //           </section>
// //         </section>

// //         <nav className="mt-8 grid grid-cols-4 rounded-3xl border border-black/10 bg-white py-3 shadow-sm">
// //           <div className="text-center text-sm text-[#F6C64D]">
// //             💬
// //             <br />
// //             ホーム
// //           </div>
// //           <div className="text-center text-sm text-gray-400">
// //             📈
// //             <br />
// //             履歴
// //           </div>
// //           <div className="text-center text-sm text-gray-400">
// //             📊
// //             <br />
// //             分析
// //           </div>
// //           <div className="text-center text-sm text-gray-400">
// //             👤
// //             <br />
// //             マイページ
// //           </div>
// //         </nav>
// //       </div>
// //     </main>
// //   );
// // }





// // // import Link from "next/link";
// // // import { SCENES } from "@/lib/scenes";
// // // import { CHARACTERS } from "@/lib/characters";

// // // const STARS = ["", "★☆☆", "★★☆", "★★★"];

// // // export default function HomePage() {
// // //   return (
// // //     <main className="mx-auto max-w-6xl px-8 py-16">
// // //       <header className="mb-16">
// // //         <p className="label-en text-sm">Qhat</p>
// // //         <h1 className="font-mincho text-5xl font-bold tracking-wide">
// // //           Qhat
// // //         </h1>
// // //         <p className="mt-3 text-ink-soft text-lg font-mincho">
// // //           リハーサルから本番へ。
// // //         </p>
// // //         <p className="mt-1 text-ink-pale text-sm">
// // //           相手の感情は、観測されるまで重ね合わせのまま。
// // //         </p>
// // //       </header>

// // //       <section className="mb-12">
// // //         <p className="label-en text-xs mb-3">Scenes</p>
// // //         <h2 className="font-mincho text-2xl mb-6">
// // //           今日は、どの場面を練習しますか？
// // //         </h2>
// // //         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
// // //           {SCENES.map((s) => {
// // //             const c = CHARACTERS[s.characterId];
// // //             return (
// // //               <Link
// // //                 key={s.id}
// // //                 href={`/conversation/${s.id}`}
// // //                 className="group block rounded-lg border border-line bg-white p-6 transition hover:border-gold hover:shadow-md"
// // //               >
// // //                 <div className="flex items-start justify-between mb-4">
// // //                   <div
// // //                     className="h-12 w-12 rounded-full flex items-center justify-center text-white font-mincho text-lg"
// // //                     style={{ background: c.accent }}
// // //                   >
// // //                     {c.name[0]}
// // //                   </div>
// // //                   <span className="label-en text-xs">
// // //                     {STARS[s.difficulty]}
// // //                   </span>
// // //                 </div>
// // //                 <h3 className="font-mincho text-lg mb-2 group-hover:text-gold transition">
// // //                   {s.title}
// // //                 </h3>
// // //                 <p className="text-sm text-ink-soft mb-4 leading-relaxed">
// // //                   {s.description}
// // //                 </p>
// // //                 <div className="flex items-center justify-between text-xs text-ink-pale">
// // //                   <span>
// // //                     相手: {c.name}（{c.age}歳）
// // //                   </span>
// // //                   <span className="label-en">{s.durationMin} min</span>
// // //                 </div>
// // //               </Link>
// // //             );
// // //           })}
// // //         </div>
// // //       </section>

// // //       <div className="qhat-divider my-16" />

// // //       <section>
// // //         <p className="label-en text-xs mb-3">About</p>
// // //         <div className="grid md:grid-cols-3 gap-8 text-sm text-ink-soft leading-relaxed">
// // //           <div>
// // //             <h3 className="font-mincho text-ink mb-2">
// // //               会話のリハーサル
// // //             </h3>
// // //             本番前に、安全に何度でもやり直せる。
// // //           </div>
// // //           <div>
// // //             <h3 className="font-mincho text-ink mb-2">
// // //               重ね合わせの感情
// // //             </h3>
// // //             相手の感情は喜・安・不・戸の重ね合わせ。観測されてはじめて確定する。
// // //           </div>
// // //           <div>
// // //             <h3 className="font-mincho text-ink mb-2">
// // //               卒業するプロダクト
// // //             </h3>
// // //             使わなくなったら成功。あなたが本番に出ていける日まで。
// // //           </div>
// // //         </div>
// // //       </section>
// // //     </main>
// // //   );
// // // }
