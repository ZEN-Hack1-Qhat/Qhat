"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Scene, TurnResponse } from "@/lib/types";
import { CHARACTERS } from "@/lib/characters";
import { useQhat } from "@/lib/store";
import { ConversationLog } from "@/components/ConversationLog";
import { Waveform } from "@/components/Waveform";
import { CharacterPanel } from "@/components/CharacterPanel";
import { EmotionBars } from "@/components/EmotionBars";
import { DecoherenceMeter } from "@/components/DecoherenceMeter";
import { ReceptionPanel } from "@/components/ReceptionPanel";
import { useSpeechRecognition, speak } from "@/lib/speech";
import { dominant } from "@/lib/emotion";
import { EmotionBlob } from "@/components/EmotionBlob";
import { MaMeter } from "@/components/MaMeter";
import { SceneIntro } from "@/components/SceneIntro";

const BlochSphere = dynamic(
  () => import("@/components/BlochSphere").then((m) => m.BlochSphere),
  { ssr: false, loading: () => <div className="aspect-square w-full bg-paper/50 rounded" /> }
);

const PROACTIVE_IDLE_MS = 15_000;
const PROACTIVE_COOLDOWN_MS = 20_000;
const PROACTIVE_MAX = 4;
const SILENCE_MS = 1_500;
// hands-free: how long the user must stay silent (after some speech) before
// the system auto-submits. Long enough to handle natural mid-sentence pauses,
// short enough to feel responsive.
const HANDS_FREE_SUBMIT_MS = 3_500;
const HANDS_FREE_MIN_CHARS = 3;

export function ConversationClient({ scene }: { scene: Scene }) {
  const character = CHARACTERS[scene.characterId];
  const {
    setScene,
    messages,
    emotion,
    prevEmotion,
    decoherence,
    bumpDecoherence,
    setDecoherence,
    pushMessage,
    updateEmotion,
    draftText,
    setDraft,
    isRecording,
    setRecording,
    isThinking,
    setThinking,
    isSpeaking,
    setSpeaking,
    redoCount,
    incRedo,
    resetRedo,
    registerInteraction,
    registerProactive,
    proactiveCount,
    lastProactiveAt,
    lastInteractionAt,
    proactiveEnabled,
    toggleProactive,
  } = useQhat();

  const [level, setLevel] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [started, setStarted] = useState(false);
  const [handsFree, setHandsFree] = useState(true);
  const [mode, setMode] = useState<string | null>(null);
  const lastSoundAtRef = useRef<number>(Date.now());
  const hasSpokenRef = useRef(false);
  const lastReaction = messages[messages.length - 1]?.reactionBubble;
  const lastReactionId = messages[messages.length - 1]?.id;

  // Set up scene state up-front so the underlying components can render
  // sensibly while the intro screen is shown. The opening line is held back
  // and only spoken after the user clicks 「始める」.
  useEffect(() => {
    setScene(scene);
    hasSpokenRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id]);

  // Probe the API mode (mock vs gemini) once on mount so the header badge
  // tells the user what they're actually talking to.
  useEffect(() => {
    fetch("/api/turn")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.mode && setMode(d.mode))
      .catch(() => {});
  }, []);

  const handleSceneStart = useCallback(
    ({ handsFree: hf }: { handsFree: boolean }) => {
      setHandsFree(hf);
      setStarted(true);
      if (scene.openingLine && !hasSpokenRef.current) {
        hasSpokenRef.current = true;
        const c = CHARACTERS[scene.characterId];
        setSpeaking(true);
        speak(scene.openingLine, {
          ...c.voice,
          onEnd: () => setSpeaking(false),
        });
      }
    },
    [scene.characterId, scene.openingLine, setSpeaking]
  );

  const recognition = useSpeechRecognition({
    onInterim: (text) => setDraft(text),
    onFinal: (text) => setDraft(text),
    onLevel: (rms) => {
      setLevel(rms);
      if (rms > 0.04) lastSoundAtRef.current = Date.now();
    },
  });

  const handleStartRecording = useCallback(async () => {
    if (isThinking || isSpeaking) return;
    registerInteraction();
    setDraft("");
    recognition.resetFinal();
    lastSoundAtRef.current = Date.now();
    await recognition.start();
    setRecording(true);
  }, [
    isThinking,
    isSpeaking,
    recognition,
    registerInteraction,
    setDraft,
    setRecording,
  ]);

  const handleStopRecording = useCallback(() => {
    recognition.stop();
    setRecording(false);
  }, [recognition, setRecording]);

  const handleRedo = useCallback(() => {
    handleStopRecording();
    setDraft("");
    incRedo();
    bumpDecoherence(-15);
    registerInteraction();
  }, [handleStopRecording, setDraft, incRedo, bumpDecoherence, registerInteraction]);

  // Use a ref so async continuations always read the latest fn (avoids stale
  // closures in the speech-onEnd → expand chain).
  const callTurnRef = useRef<
    (text: string, opts?: { proactive?: boolean; expand?: boolean }) => Promise<void>
  >(async () => {});

  const callTurn = useCallback(
    async (
      userText: string,
      opts: { proactive?: boolean; expand?: boolean } = {}
    ) => {
      setThinking(true);
      // Read latest state at call time, not closure-captured time.
      const state = useQhat.getState();
      const latestEmotion = state.emotion;
      const latestRedo = state.redoCount;
      // Send the bulk of the conversation so the LLM can stay in context.
      const history = state.messages.slice(-40).map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        timestamp: m.timestamp,
        speaker: m.speaker,
      }));
      let data: TurnResponse & { mode?: string };
      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_text: userText,
            prev_emotion: latestEmotion,
            character_id: scene.characterId,
            scene_id: scene.id,
            history,
            key_facts: state.keyFacts,
            redo_count: latestRedo,
            proactive: opts.proactive,
            expand: opts.expand,
          }),
        });
        if (!res.ok) throw new Error(`turn failed: ${res.status}`);
        data = await res.json();
      } catch {
        setThinking(false);
        return;
      }
      if (data.mode) setMode(data.mode);
      if (data.keyFactsLearned && data.keyFactsLearned.length > 0) {
        useQhat.getState().addKeyFacts(data.keyFactsLearned);
      }
      const msg = data.characterMessage;
      updateEmotion(msg.emotion!);
      pushMessage(msg);
      setDecoherence(0);
      setThinking(false);
      setSpeaking(true);
      speak(msg.text, {
        ...character.voice,
        onEnd: () => {
          setSpeaking(false);
          if (
            !opts.proactive &&
            !opts.expand &&
            userText.trim().length <= 5 &&
            userText.trim().length > 0 &&
            Math.random() < 0.5
          ) {
            setTimeout(() => callTurnRef.current("", { expand: true }), 800);
          }
        },
      });
    },
    [
      character.voice,
      pushMessage,
      scene.characterId,
      setDecoherence,
      setSpeaking,
      setThinking,
      updateEmotion,
    ]
  );

  useEffect(() => {
    callTurnRef.current = callTurn;
  }, [callTurn]);

  const handleObserve = useCallback(async () => {
    const text = draftText.trim();
    if (!text || isThinking || isSpeaking) return;
    handleStopRecording();
    bumpDecoherence(-25);
    registerInteraction();
    pushMessage({
      id: `msg_user_${Date.now()}`,
      role: "user",
      text,
      timestamp: Date.now(),
    });
    setDraft("");
    await callTurn(text);
    resetRedo();
  }, [
    bumpDecoherence,
    callTurn,
    draftText,
    handleStopRecording,
    isSpeaking,
    isThinking,
    pushMessage,
    registerInteraction,
    resetRedo,
    setDraft,
  ]);

  // Hands-free auto-submit. While recording with non-empty draft, watch for
  // silence (no audio above threshold) lasting > HANDS_FREE_SUBMIT_MS and then
  // call observe automatically. Pauses while assistant is busy.
  const handleObserveRef = useRef(handleObserve);
  useEffect(() => {
    handleObserveRef.current = handleObserve;
  }, [handleObserve]);

  useEffect(() => {
    if (!handsFree || !started) return;
    if (!isRecording || isThinking || isSpeaking) return;
    const id = setInterval(() => {
      const silentFor = Date.now() - lastSoundAtRef.current;
      // Only fire once we have meaningful draft and the user has clearly
      // finished speaking (silence beyond threshold).
      if (
        silentFor > HANDS_FREE_SUBMIT_MS &&
        draftText.trim().length >= HANDS_FREE_MIN_CHARS
      ) {
        handleObserveRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [handsFree, isRecording, isThinking, isSpeaking, started, draftText]);

  // decoherence ticker
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (isThinking || isSpeaking) return;
      if (isRecording) {
        const silentFor = now - lastSoundAtRef.current;
        if (silentFor > SILENCE_MS) bumpDecoherence(1.2);
        else bumpDecoherence(-0.3);
      } else {
        bumpDecoherence(0.4);
      }
    }, 200);
    return () => clearInterval(id);
  }, [isRecording, isThinking, isSpeaking, bumpDecoherence]);

  // proactive trigger
  useEffect(() => {
    const id = setInterval(() => {
      if (!proactiveEnabled) return;
      if (isThinking || isSpeaking || isRecording) return;
      if (proactiveCount >= PROACTIVE_MAX) return;
      const now = Date.now();
      const idle = now - lastInteractionAt;
      const cooldown = now - lastProactiveAt;
      if (idle >= PROACTIVE_IDLE_MS && cooldown >= PROACTIVE_COOLDOWN_MS) {
        registerProactive();
        registerInteraction();
        callTurn("", { proactive: true });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [
    callTurn,
    isRecording,
    isSpeaking,
    isThinking,
    lastInteractionAt,
    lastProactiveAt,
    proactiveCount,
    proactiveEnabled,
    registerInteraction,
    registerProactive,
  ]);

  // Hands-free: when the assistant finishes speaking and we are idle, kick
  // recording back on so the user just talks back without pressing buttons.
  const wasSpeakingRef = useRef(false);
  const handleStartRecordingRef = useRef(handleStartRecording);
  useEffect(() => {
    handleStartRecordingRef.current = handleStartRecording;
  }, [handleStartRecording]);

  useEffect(() => {
    if (!handsFree || !started) return;
    if (wasSpeakingRef.current && !isSpeaking && !isThinking && !isRecording) {
      // Add a small grace so the user has a beat to think before the mic opens.
      const id = setTimeout(() => {
        handleStartRecordingRef.current();
      }, 500);
      wasSpeakingRef.current = false;
      return () => clearTimeout(id);
    }
    wasSpeakingRef.current = isSpeaking;
  }, [handsFree, started, isSpeaking, isThinking, isRecording]);

  if (!started) {
    return <SceneIntro scene={scene} onStart={handleSceneStart} />;
  }

  const silentNow =
    isRecording && Date.now() - lastSoundAtRef.current > SILENCE_MS;
  const lastCharMessage = [...messages].reverse().find((m) => m.role === "character");
  // The "間" meter pauses while the user is recording, the assistant is
  // generating, or the assistant is speaking back. Otherwise it counts up
  // from the moment the conversation last advanced.
  const maPaused = isRecording || isThinking || isSpeaking;

  return (
    <main className="min-h-screen flex flex-col">
      {/* header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-line bg-paper">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-mincho text-lg hover:text-gold">
            Qhat
          </Link>
          <span className="text-ink-pale">/</span>
          <span className="font-mincho text-sm text-ink-soft">{scene.title}</span>
          {mode && (
            <span
              className={`label-en text-[10px] px-2 py-0.5 rounded-full border ${
                mode === "gemini"
                  ? "border-gold text-gold bg-gold-soft/30"
                  : "border-line text-ink-pale"
              }`}
              title={
                mode === "gemini"
                  ? "Gemini 2.5 Flash で会話中"
                  : "テンプレ応答中。GEMINI_API_KEY を設定すると LLM 応答に切り替わります。"
              }
            >
              {mode === "gemini" ? "● LLM" : "● Mock"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={handsFree}
              onChange={(e) => setHandsFree(e.target.checked)}
              className="accent-gold"
            />
            ハンズフリー
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={proactiveEnabled}
              onChange={toggleProactive}
              className="accent-gold"
            />
            向こうから話しかけ
          </label>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs px-2 py-1 text-ink-pale hover:text-ink label-en"
            aria-pressed={showAdvanced}
          >
            {showAdvanced ? "− Advanced" : "+ Advanced"}
          </button>
          <button
            onClick={() => setShowLog((v) => !v)}
            className="text-xs px-2 py-1 text-ink-pale hover:text-ink label-en"
            aria-pressed={showLog}
          >
            {showLog ? "− Log" : "+ Log"}
          </button>
          <Link
            href={`/review/${scene.id}`}
            className="text-xs px-3 py-1.5 border border-line rounded hover:border-ink"
          >
            終了
          </Link>
        </div>
      </header>

      {/* MAIN STAGE — character + blob centered */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-6 relative">
        <div className="relative flex items-center justify-center">
          {/* watercolor blob behind the character */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-0">
            <EmotionBlob probs={emotion} decoherence={decoherence} size={420} />
          </div>
          <div className="relative z-10">
            <CharacterPanel
              characterId={scene.characterId}
              emotion={emotion}
              decoherence={decoherence}
              reactionBubble={lastReaction}
              reactionKey={lastReactionId}
              thinking={isThinking}
              speaking={isSpeaking}
              proactive={lastCharMessage?.proactive}
            />
          </div>
        </div>

        {/* secondary feedback band: 間メーター + 短い感情ストリップ */}
        <div className="w-full max-w-2xl mt-8 space-y-4">
          <MaMeter
            lastInteractionAt={lastInteractionAt}
            paused={maPaused}
          />
          <div className="grid grid-cols-2 gap-4">
            <EmotionBars probs={emotion} />
            <ReceptionPanel
              prev={prevEmotion}
              curr={emotion}
              summary={lastCharMessage?.receptionSummary}
            />
          </div>
          <DecoherenceMeter value={decoherence} />
        </div>

        {/* Advanced: Bloch sphere — opt-in for the physics-curious */}
        {showAdvanced && (
          <div className="w-full max-w-md mt-8 border-t border-line pt-6">
            <p className="label-en text-xs mb-2 text-center">Bloch Sphere (advanced)</p>
            <BlochSphere probs={emotion} decoherence={decoherence} />
          </div>
        )}
      </section>

      {/* BOTTOM DRAWER — conversation log (collapsible) */}
      {showLog && (
        <div className="border-t border-line bg-paper/60 max-h-[28vh] overflow-hidden flex flex-col">
          <ConversationLog messages={messages} />
        </div>
      )}

      {/* RECORDER — always pinned at bottom */}
      <div className="border-t border-line bg-white px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="min-h-[44px] mb-3 rounded border border-line bg-paper/50 px-3 py-2 font-mincho text-sm text-ink">
            {draftText || (
              <span className="text-ink-pale">
                {isRecording
                  ? "聞いています…"
                  : isThinking
                  ? "考え中…"
                  : isSpeaking
                  ? "話しています…"
                  : "🎤 を押して話してみて"}
              </span>
            )}
          </div>
          <Waveform level={level} silent={silentNow} active={isRecording} />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={
                  isRecording ? handleStopRecording : handleStartRecording
                }
                disabled={isThinking || isSpeaking}
                className={`h-12 w-12 rounded-full flex items-center justify-center text-lg transition disabled:opacity-40 ${
                  isRecording
                    ? "bg-gold text-white animate-pulse-gold"
                    : "border border-ink text-ink hover:bg-ink hover:text-paper"
                }`}
                aria-label={isRecording ? "録音停止" : "録音開始"}
              >
                🎤
              </button>
              <button
                onClick={handleRedo}
                disabled={!draftText || isThinking || isSpeaking}
                className="px-3 py-2 text-xs border border-gold text-gold rounded hover:bg-gold-soft disabled:opacity-30"
              >
                録り直す
                {redoCount > 0 && (
                  <span className="mono ml-1 text-ink-pale">×{redoCount}</span>
                )}
              </button>
            </div>
            <button
              onClick={handleObserve}
              disabled={!draftText.trim() || isThinking || isSpeaking}
              className="px-6 py-2.5 bg-ink text-paper text-sm font-mincho rounded hover:bg-ink-soft disabled:opacity-30"
            >
              観測する →
            </button>
          </div>
          {!recognition.supported && (
            <p className="mt-2 text-[11px] text-purple">
              このブラウザは音声認識に未対応です。Chrome / Edge をご利用ください。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
