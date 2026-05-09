"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScene } from "@/lib/scenes";
import { CHARACTERS } from "@/lib/characters";
import { dominant, EMOTION_LABEL, EMOTIONS } from "@/lib/emotion";
import { speak, transcribeWithWhisper, useSpeechRecognition } from "@/lib/speech";
import { ConversationLog } from "@/components/ConversationLog";
import { BottomNav } from "@/components/BottomNav";
import { StoryView } from "@/components/StoryView";
import { ReflectionView } from "@/components/ReflectionView";
import { EpisodeBriefing } from "@/components/EpisodeBriefing";
import { EpisodeReview } from "@/components/EpisodeReview";
import {
  getSettings,
  markEpisodeComplete,
  saveEffectiveLine,
  saveSession,
  setLastScene,
} from "@/lib/sessionStore";
import type { StoryEpisode } from "@/lib/story";
import { biggestShift, checkAllGoals, isPositiveLanding } from "@/lib/goals";
import type { Emotion, EmotionProbs, Message, TurnResponse } from "@/lib/types";

// Five-state router: timeline → briefing → conversation → review → back to
// timeline. The briefing step gives the practitioner a beat to read what
// the day is about before mic-on conversation; the review step shows the
// LLM-judged "what worked / try next / verdict" before returning to the
// timeline. Day 30 is its own reflection branch (no scene). Mounting
// ConversationView with `key={episode.id}` resets per-day state cleanly
// when the same view is reused for a different day.
type Screen =
  | { kind: "story" }
  | { kind: "briefing"; episode: StoryEpisode }
  | { kind: "conversation"; episode: StoryEpisode }
  | {
      kind: "review";
      episode: StoryEpisode;
      messages: Message[];
      llmHitGoalIds: string[];
    }
  | { kind: "reflection"; episode: StoryEpisode };

export default function HomePage() {
  const [screen, setScreen] = useState<Screen>({ kind: "story" });

  // Picking a regular episode from the timeline opens the briefing first;
  // the briefing's "始める" button is what actually starts the
  // conversation. This split prevents people from landing in mic-on mode
  // before they know what they're practising.
  const openBriefing = useCallback((ep: StoryEpisode) => {
    setLastScene(ep.sceneId);
    setScreen({ kind: "briefing", episode: ep });
  }, []);

  const startConversation = useCallback((ep: StoryEpisode) => {
    setScreen({ kind: "conversation", episode: ep });
  }, []);

  const openReflection = useCallback((ep: StoryEpisode) => {
    setScreen({ kind: "reflection", episode: ep });
  }, []);

  // Three paths off the conversation screen:
  //   - finishConversation: user tapped 完了. Mark the episode done so
  //     graduation advances even if they navigate away mid-review, then
  //     route into the Review screen with the transcript + LLM hits.
  //   - closeWithoutCompleting: user tapped the back arrow. No progress
  //     change — closing the tab mid-talk shouldn't accidentally
  //     graduate them.
  //   - finishReview: review's "次へ" — back to the timeline.
  const finishConversation = useCallback(
    (
      episode: StoryEpisode,
      messages: Message[],
      llmHitGoalIds: string[]
    ) => {
      markEpisodeComplete(episode.id);
      setScreen({ kind: "review", episode, messages, llmHitGoalIds });
    },
    []
  );
  const closeWithoutCompleting = useCallback(() => {
    setScreen({ kind: "story" });
  }, []);
  const finishReview = useCallback(() => {
    setScreen({ kind: "story" });
  }, []);
  // Reflection (Day 30) keeps its own simple complete-and-return path.
  const closeReflection = useCallback((episodeId: string) => {
    markEpisodeComplete(episodeId);
    setScreen({ kind: "story" });
  }, []);

  if (screen.kind === "story") {
    return (
      <StoryView
        onPickEpisode={openBriefing}
        onOpenReflection={openReflection}
      />
    );
  }
  if (screen.kind === "briefing") {
    return (
      <EpisodeBriefing
        episode={screen.episode}
        onStart={() => startConversation(screen.episode)}
        onBack={closeWithoutCompleting}
      />
    );
  }
  if (screen.kind === "reflection") {
    return (
      <ReflectionView
        episode={screen.episode}
        onComplete={() => closeReflection(screen.episode.id)}
        onBack={closeWithoutCompleting}
      />
    );
  }
  if (screen.kind === "review") {
    return (
      <EpisodeReview
        episode={screen.episode}
        messages={screen.messages}
        llmHitGoalIds={screen.llmHitGoalIds}
        onNext={finishReview}
      />
    );
  }
  return (
    <ConversationView
      key={screen.episode.id}
      episode={screen.episode}
      onComplete={(messages, llmHitGoalIds) =>
        finishConversation(screen.episode, messages, llmHitGoalIds)
      }
      onAbandon={closeWithoutCompleting}
    />
  );
}

type IOMode = "voice" | "chat";
const IO_MODE_STORAGE_KEY = "qhat:io_mode";

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

// Mix a hex color with white. amount=0 returns the original, amount=1 returns
// pure white. Used by the cat ear to derive a body-blending outer color from
// the saturated emotion accent — keeps the ears tonally consistent with the
// dominant-emotion body color regardless of which emotion is active.
function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const r2 = Math.round(r + (255 - r) * amount);
  const g2 = Math.round(g + (255 - g) * amount);
  const b2 = Math.round(b + (255 - b) * amount);
  const hx = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hx(r2)}${hx(g2)}${hx(b2)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Reusable character face. The dominant emotion drives eye shape, mouth shape,
// and body motion — the user's primary read for "how does the character feel".
function CharacterFace({
  emotion,
  size = 190,
  showThinking = false,
}: {
  emotion: EmotionProbs;
  size?: number;
  showThinking?: boolean;
}) {
  const dom = dominant(emotion);
  const ui = emotionUI[dom];
  const k = size / 190;

  const animClass =
    dom === "joy"
      ? "animate-[bounce_1.8s_ease-in-out_infinite]"
      : dom === "anxiety"
      ? "animate-[pulse_1.2s_ease-in-out_infinite]"
      : dom === "confusion"
      ? "animate-[wobble_2.6s_ease-in-out_infinite]"
      : "animate-[floaty_3.8s_ease-in-out_infinite]";

  const eyeTop = 78 * k;
  const eyeSide = 62 * k;
  const mouthTop = 116 * k;

  const renderEye = (side: "left" | "right") => {
    const sideStyle =
      side === "left" ? { left: eyeSide } : { right: eyeSide };
    if (dom === "joy") {
      // ^_^ closed curved eyes
      return (
        <div
          className="absolute"
          style={{
            ...sideStyle,
            top: eyeTop + 8 * k,
            width: 22 * k,
            height: 12 * k,
            borderTop: `${Math.max(2, 3 * k)}px solid #2a241d`,
            borderRadius: "999px 999px 0 0",
          }}
        />
      );
    }
    if (dom === "anxiety") {
      // Wide concerned circles — slightly bigger than baseline
      return (
        <div
          className="absolute rounded-full bg-[#2a241d]"
          style={{
            ...sideStyle,
            top: eyeTop - 1 * k,
            width: 13 * k,
            height: 13 * k,
          }}
        />
      );
    }
    if (dom === "confusion") {
      // Small dots, slight vertical mismatch for an off-balance look
      const offsetTop =
        side === "left" ? eyeTop + 4 * k : eyeTop + 10 * k;
      return (
        <div
          className="absolute rounded-full bg-[#2a241d]"
          style={{
            ...sideStyle,
            top: offsetTop,
            width: 7 * k,
            height: 7 * k,
          }}
        />
      );
    }
    // calm (default): slim soft ovals
    return (
      <div
        className="absolute rounded-full bg-[#2a241d]"
        style={{
          ...sideStyle,
          top: eyeTop + 6 * k,
          width: 9 * k,
          height: 16 * k,
        }}
      />
    );
  };

  const mouthStyle: React.CSSProperties = (() => {
    if (ui.mouth === "happy") {
      return {
        width: 42 * k,
        height: 20 * k,
        borderBottom: `${Math.max(3, 6 * k)}px solid #2a241d`,
        borderRadius: "0 0 999px 999px",
      };
    }
    if (ui.mouth === "sad") {
      return {
        width: 34 * k,
        height: 16 * k,
        borderTop: `${Math.max(2, 5 * k)}px solid #2a241d`,
        borderRadius: "999px 999px 0 0",
      };
    }
    if (ui.mouth === "flat") {
      return {
        width: 30 * k,
        height: Math.max(3, 5 * k),
        background: "#2a241d",
        borderRadius: 999,
      };
    }
    return {
      width: 34 * k,
      height: 16 * k,
      borderBottom: `${Math.max(2, 5 * k)}px solid #2a241d`,
      borderRadius: "0 0 999px 999px",
    };
  })();

  return (
    <div
      className={`relative transition-all duration-700 ${animClass}`}
      style={{
        width: size,
        height: size,
        borderRadius: "42% 42% 38% 38% / 46% 46% 54% 54%",
        // Single vivid color shift driven by the dominant emotion. The 4-color
        // distribution moves into the heart-ring below so the body stays a
        // clean read of the dominant mood.
        background: ui.blob,
        boxShadow: `0 ${24 * k}px ${44 * k}px ${ui.glow}, inset 0 ${
          -10 * k
        }px ${20 * k}px rgba(255,255,255,0.12)`,
      }}
    >
      {/* Cat ears.
          Outer = lighten(ui.color, 0.4): a body-adjacent shade so the ear
          reads as part of the head, not glued on. Inner = ui.color: the
          saturated dominant tone for depth. Wider base + softer apex so the
          ears feel chunky and friendly rather than sharp horns. */}
      <svg
        className="absolute pointer-events-none"
        style={{
          top: -22 * k,
          left: 0,
          width: size,
          height: 28 * k,
          overflow: "visible",
        }}
        viewBox="0 0 190 28"
        preserveAspectRatio="none"
      >
        {/* Left ear */}
        <path
          d="M 36 28 Q 40 22 48 8 Q 53 2 58 8 Q 66 22 70 28 Z"
          fill={lighten(ui.color, 0.4)}
        />
        <path
          d="M 45 28 Q 49 18 53 12 Q 57 18 61 28 Z"
          fill={ui.color}
        />
        {/* Right ear */}
        <path
          d="M 120 28 Q 124 22 132 8 Q 137 2 142 8 Q 150 22 154 28 Z"
          fill={lighten(ui.color, 0.4)}
        />
        <path
          d="M 129 28 Q 133 18 137 12 Q 141 18 145 28 Z"
          fill={ui.color}
        />
      </svg>

      {showThinking && (
        <div className="absolute right-[-10px] top-3 flex items-center gap-1 rounded-full border border-black/5 bg-white/80 px-2.5 py-2 shadow-sm backdrop-blur">
          <span className="thinking-dot" />
          <span className="thinking-dot delay-150" />
          <span className="thinking-dot delay-300" />
        </div>
      )}

      {renderEye("left")}
      {renderEye("right")}

      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ ...mouthStyle, top: mouthTop }}
      />
    </div>
  );
}

const PROACTIVE_IDLE_MS = 9000;
const PROACTIVE_COOLDOWN_MS = 16000;
const PROACTIVE_MAX = 3;

// Hands-free: silence threshold to auto-submit, and minimum chars to avoid
// firing on "あ" / "えっと". A short reply like "うん" / "はい" should still
// be allowed to submit, hence MIN_CHARS = 2.
const HANDS_FREE_SUBMIT_MS = 3500;
const HANDS_FREE_MIN_CHARS = 2;
// RMS audio level above which we consider the user to be speaking.
const VOICE_LEVEL_THRESHOLD = 0.04;

function ConversationView({
  episode,
  onComplete,
  onAbandon,
}: {
  episode: StoryEpisode;
  // User tapped "完了" — pass the transcript and the LLM-judged goal hits
  // up so the parent can route to the Review screen with that context.
  onComplete: (messages: Message[], llmHitGoalIds: string[]) => void;
  // User tapped the back arrow — leave without marking complete.
  onAbandon: () => void;
}) {
  const scene = useMemo(() => getScene(episode.sceneId), [episode.sceneId]);
  const character = scene ? CHARACTERS[scene.characterId] : null;
  // Ephemeral "響いた" overlay shown briefly when the partner's emotion
  // shifts in a positive direction after a user reply. Auto-clears after
  // ~2.5s so it never lingers into the next turn. Negative shifts don't
  // get an overlay — the receptionSummary text under the bubble carries
  // that signal less punishingly.
  const [landing, setLanding] = useState<{
    emotion: Emotion;
    sign: 1 | -1;
  } | null>(null);
  // Accumulated set of goal ids the LLM judged satisfied across the turns
  // so far. Once a goal is hit it stays hit — replays / further turns can
  // only add. The render layer ORs this with the deterministic heuristic
  // check so semantic wins (paraphrased echo, indirect questions) count
  // even when the regex misses them.
  const [llmHitGoals, setLlmHitGoals] = useState<Set<string>>(new Set());

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

  // Stable per-session id + start timestamp. Generated lazily on mount so
  // each page load starts a fresh session, but the id stays constant for the
  // lifetime of the page so saveSession can upsert the growing conversation
  // into the same row instead of duplicating it.
  const [sessionId] = useState(
    () => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
  const [startedAt] = useState(() => Date.now());

  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [lastInteractionAt, setLastInteractionAt] = useState(Date.now());
  const [lastProactiveAt, setLastProactiveAt] = useState(0);
  const [proactiveCount, setProactiveCount] = useState(0);
  const [proactiveEnabled] = useState(true);
  // Voice/chat I/O mode. Persisted in localStorage so the user lands on the
  // mode they last used. Defaults to voice (matches the original UI).
  const [ioMode, setIoMode] = useState<IOMode>("voice");
  useEffect(() => {
    const stored = localStorage.getItem(IO_MODE_STORAGE_KEY);
    if (stored === "voice" || stored === "chat") setIoMode(stored);
  }, []);
  useEffect(() => {
    localStorage.setItem(IO_MODE_STORAGE_KEY, ioMode);
  }, [ioMode]);

  const latestTextRef = useRef("");
  // Last time the mic picked up audio above VOICE_LEVEL_THRESHOLD. Used by
  // the hands-free auto-submit timer to detect end of utterance.
  const lastSoundAtRef = useRef<number>(Date.now());

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

  const recognition = useSpeechRecognition({
    onInterim: (t) => {
      latestTextRef.current = t;
      setText(t);
    },
    onFinal: (t) => {
      latestTextRef.current = t;
      setText(t);
    },
    onLevel: (rms) => {
      if (rms > VOICE_LEVEL_THRESHOLD) lastSoundAtRef.current = Date.now();
    },
  });

  const send = useCallback(
    async (overrideText?: string, opts?: { proactive?: boolean }) => {
      if (!scene || !character || loading) return;

      let userText = (overrideText ?? latestTextRef.current ?? text).trim();

      if (!opts?.proactive && !userText) return;

      setError("");

      // Capture audio for Whisper *before* showing the user message — the
      // MediaRecorder needs to be flushed and stopped to read its chunks.
      // We still render the recognition text immediately afterward so the
      // user sees what they said, then upgrade to Whisper text once it
      // arrives. Voice mode + non-proactive only.
      let audioBlob: Blob | null = null;
      const usedVoice =
        !opts?.proactive && ioMode === "voice" && recognition.running;
      if (usedVoice) {
        try {
          audioBlob = await recognition.stopAndGetAudio();
        } catch {
          audioBlob = null;
        }
      }

      let nextHistory = messages;
      const userMessageId = `user_${Date.now()}`;

      if (!opts?.proactive) {
        const userMessage: Message = {
          id: userMessageId,
          role: "user",
          text: userText,
          timestamp: Date.now(),
        };

        nextHistory = [...messages, userMessage];
        setMessages(nextHistory);
        setText("");
        latestTextRef.current = "";
        // Voice mode: the speech recognizer accumulates final transcripts
        // internally. Without resetting, the next interim/final result
        // re-injects the just-sent text back into the input.
        recognition.resetFinal();
        lastSoundAtRef.current = Date.now();
      }

      setLoading(true);
      setLastInteractionAt(Date.now());

      // Whisper hybrid: if we captured audio, run a higher-accuracy
      // transcription and use it for both the on-screen user bubble and the
      // LLM call. Falls back to the recognition text silently when the
      // local server isn't reachable, so this never blocks the flow.
      if (audioBlob) {
        const whisperText = await transcribeWithWhisper(audioBlob);
        if (whisperText && whisperText !== userText) {
          userText = whisperText;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === userMessageId ? { ...m, text: whisperText } : m
            )
          );
          nextHistory = nextHistory.map((m) =>
            m.id === userMessageId ? { ...m, text: whisperText } : m
          );
        }
      }

      // Pick out the goals the LLM should evaluate for this turn. Emotion
      // thresholds, length, and turn-order goals stay client-side because
      // their checks are deterministic and cheaper than a round trip; the
      // LLM only weighs in on the genuinely semantic ones (echo, question,
      // self-disclosure, recovery phrasing).
      const llmJudgeableTypes = new Set([
        "user_echo",
        "user_question",
        "user_self_disclosure",
        "recovery_phrase",
      ]);
      const goalsToJudge = (episode.goals ?? [])
        .filter((g) => llmJudgeableTypes.has(g.type))
        .map((g) => ({ id: g.id, label: g.label }));

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
            goals_to_judge: goalsToJudge,
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

        // Fold any LLM-judged goal hits into the accumulator. Heuristics
        // still run independently in checkAllGoals — this set is the
        // "yes, semantically counted" bucket that survives weak regex.
        if (Array.isArray(data.goalsHit) && data.goalsHit.length > 0) {
          setLlmHitGoals((prev) => {
            const next = new Set(prev);
            for (const id of data.goalsHit ?? []) next.add(id);
            return next;
          });
        }

        // Detect a meaningful emotion shift triggered by the user's last
        // reply. If it's a positive landing (joy/calm up, anxiety/confusion
        // down), surface a brief "響いた" overlay AND record the user's
        // last line as an "effective line" — words that worked for this
        // particular person, replayed in the Day-30 reflection.
        const shift = biggestShift(emotion, nextEmotion);
        if (shift && isPositiveLanding(shift)) {
          setLanding({ emotion: shift.emotion, sign: shift.sign });
          // Proactive partner messages have no triggering user line — skip
          // those so the effective-lines list stays attributable.
          if (!opts?.proactive && userText.trim()) {
            saveEffectiveLine({
              text: userText.trim(),
              episodeId: episode.id,
              characterId: scene.characterId,
              emotion: shift.emotion,
              delta: shift.delta,
              timestamp: Date.now(),
            });
          }
        }

        setEmotion(nextEmotion);
        setMessages((prev) => [...prev, data.characterMessage!]);
        setLastInteractionAt(Date.now());

        // Chat mode: render the message but skip TTS — user is reading, not
        // listening, so keep things silent.
        if (ioMode === "voice") {
          setIsSpeaking(true);
          speak(data.characterMessage.text, {
            ...character.voice,
            onEnd: () => setIsSpeaking(false),
            onError: () => setIsSpeaking(false),
          });
        }
      } catch (e) {
        console.error(e);
        setError("通信に失敗しました");
      } finally {
        setLoading(false);
      }
    },
    [scene, character, loading, text, messages, emotion, ioMode, recognition]
  );

  const handleMic = async () => {
    if (recognition.running) {
      // Tapping the mic while recording: submit if we have text, otherwise
      // just stop. send() handles capturing the audio for Whisper before
      // stopping the recorder, so we must NOT call stop() here in the
      // submit path — that would discard the audio chunks.
      if (latestTextRef.current.trim().length > 0) {
        send();
      } else {
        recognition.stop();
      }
      return;
    }

    latestTextRef.current = "";
    setText("");
    recognition.resetFinal();
    lastSoundAtRef.current = Date.now();
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

  // Auto-clear the "響いた" overlay so it doesn't bleed into the next
  // turn. 2400ms is long enough to read the chip after speech-finish but
  // short enough that the user has already moved on by the next reply.
  useEffect(() => {
    if (!landing) return;
    const id = setTimeout(() => setLanding(null), 2400);
    return () => clearTimeout(id);
  }, [landing]);

  // Persist the in-progress session to localStorage whenever it grows. We
  // upsert by sessionId so /history and /analysis see the latest snapshot
  // even if the user closes the tab mid-conversation. Saving is gated by
  // the user's profile toggle and only kicks in once they've spoken at
  // least once — the bare opening line alone shouldn't create a "session".
  useEffect(() => {
    if (!scene) return;
    if (!getSettings().saveSessions) return;
    if (!messages.some((m) => m.role === "user")) return;
    saveSession({
      id: sessionId,
      sceneId: scene.id,
      startedAt,
      endedAt: Date.now(),
      messages,
      redoCount: 0,
    });
  }, [messages, scene, sessionId, startedAt]);

  // Hands-free auto-submit: while recording with non-empty text, watch for a
  // sustained silence (no audio level above threshold) and submit on its own.
  useEffect(() => {
    if (ioMode !== "voice") return;
    if (!recognition.running) return;
    if (loading || isSpeaking) return;
    const id = setInterval(() => {
      const silentFor = Date.now() - lastSoundAtRef.current;
      if (
        silentFor > HANDS_FREE_SUBMIT_MS &&
        latestTextRef.current.trim().length >= HANDS_FREE_MIN_CHARS
      ) {
        // send() captures audio before stopping; don't pre-stop here or we
        // lose the recording (and Whisper falls back to recognition text).
        send();
      }
    }, 250);
    return () => clearInterval(id);
  }, [ioMode, recognition, loading, isSpeaking, send]);

  // Hands-free auto-listen: once the assistant finishes speaking, re-open the
  // mic after a short grace so the user can reply without pressing anything.
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    if (ioMode !== "voice") return;
    if (
      wasSpeakingRef.current &&
      !isSpeaking &&
      !loading &&
      !recognition.running
    ) {
      const id = setTimeout(() => {
        latestTextRef.current = "";
        setText("");
        recognition.resetFinal();
        lastSoundAtRef.current = Date.now();
        recognition.start();
      }, 500);
      wasSpeakingRef.current = false;
      return () => clearTimeout(id);
    }
    wasSpeakingRef.current = isSpeaking;
  }, [ioMode, isSpeaking, loading, recognition]);

  // Stop the mic immediately when the user switches to chat mode so it isn't
  // quietly capturing audio while they're typing.
  useEffect(() => {
    if (ioMode === "chat" && recognition.running) {
      recognition.stop();
    }
  }, [ioMode, recognition]);

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
    <main className="qhat-fade-in min-h-screen bg-[#f7f5f1] text-[#2b2b2b]">
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col gap-[18px] px-[18px] py-6">
        <header className="flex items-center justify-between">
          <button
            onClick={onAbandon}
            type="button"
            aria-label="ストーリーに戻る"
            className="flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-[12px] font-extrabold text-[#5f5a53] backdrop-blur transition active:scale-[0.98]"
          >
            <span aria-hidden>←</span>
            <span className="max-w-[140px] truncate">
              Day {episode.day}・{episode.title}
            </span>
          </button>

          <div
            role="tablist"
            aria-label="入力モード"
            className="flex rounded-full border border-black/5 bg-white/80 p-1 text-[12px] font-bold backdrop-blur"
          >
            <button
              type="button"
              role="tab"
              aria-selected={ioMode === "voice"}
              onClick={() => setIoMode("voice")}
              className={`rounded-full px-3 py-1.5 transition ${
                ioMode === "voice"
                  ? "bg-[#f4be42] text-[#2a241d]"
                  : "text-[#6c665f]"
              }`}
            >
              🎤 音声
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={ioMode === "chat"}
              onClick={() => setIoMode("chat")}
              className={`rounded-full px-3 py-1.5 transition ${
                ioMode === "chat"
                  ? "bg-[#f4be42] text-[#2a241d]"
                  : "text-[#6c665f]"
              }`}
            >
              💬 チャット
            </button>
          </div>
        </header>

        {/* Persistent goal banner + per-episode goal checklist. The banner
            keeps the *why* visible; the chips show the *what* — concrete
            moves the user can try. Chips flip from outline to filled when
            their condition is met, so the user sees real-time confirmation
            that what they just said landed. */}
        <div className="flex flex-col gap-1.5 border-b border-black/5 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-full bg-[#fff3d2] px-2 py-0.5 text-[10px] font-extrabold text-[#7a5e1f]">
              目的
            </span>
            <p className="truncate text-[12px] font-bold text-[#5f5a53]">
              {episode.learningGoal}
            </p>
          </div>
          {episode.goals && episode.goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-1">
              {checkAllGoals(episode.goals, messages).map(({ goal, done }) => {
                // Merge: a goal counts as done if either the heuristic
                // says so OR the LLM already accepted it on a previous
                // turn. The heuristic catches deterministic cases (length,
                // turn order); the LLM catches paraphrased echoes and
                // indirect questions the regex would miss.
                const finalDone = done || llmHitGoals.has(goal.id);
                return (
                  <span
                    key={goal.id}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold transition ${
                      finalDone
                        ? "border-[#3d8f54] bg-[#e8f3ec] text-[#3d8f54]"
                        : "border-black/10 bg-white/60 text-[#8a8178]"
                    }`}
                  >
                    {finalDone ? "✓ " : "⃝ "}
                    {goal.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {ioMode === "voice" && (
        <section className="relative flex flex-1 flex-col items-center justify-center gap-[18px] pt-2">
          {/* Soft single-color glow tied to the dominant emotion. The 4-color
              distribution lives in the heart-ring inside the character now,
              so the surrounding canvas stays quiet. */}
          <div className="relative flex items-center justify-center">
            <div
              className="absolute rounded-full blur-2xl transition-all duration-700"
              style={{
                width: 260,
                height: 260,
                background: ui.glow,
                opacity: 0.9,
              }}
            />
            <div className="relative z-10">
              <CharacterFace
                emotion={emotion}
                size={190}
                showThinking={silentSeconds >= 5}
              />
            </div>

            {/* "響いた" overlay. Floats above the character for ~2.4s after
                a positive emotion shift. The label is keyed to which way
                the partner moved so the user gets a specific read, not a
                generic confetti — "緊張がほぐれた" lands very differently
                from "喜んでくれた" even though both are wins. */}
            {landing && (
              <div className="qhat-landing-pop pointer-events-none absolute -top-2 z-20 rounded-full border border-[#f4be42] bg-white/95 px-3 py-1.5 shadow-[0_8px_22px_rgba(244,190,66,0.35)]">
                <span className="text-[12px] font-extrabold text-[#7a5e1f]">
                  {landing.emotion === "joy" && landing.sign > 0
                    ? "✨ 喜んでくれた"
                    : landing.emotion === "calm" && landing.sign > 0
                    ? "🌿 落ち着いてくれた"
                    : landing.emotion === "anxiety" && landing.sign < 0
                    ? "💧 緊張がほぐれた"
                    : landing.emotion === "confusion" && landing.sign < 0
                    ? "💡 伝わった"
                    : "✨ 響いた"}
                </span>
              </div>
            )}
          </div>

          {/* Circular emotion-density meter: 4 radial gradients pinned to the
              4 corners of a small circle, each tinted with alpha = its
              emotion's probability. The strongest emotion floods its quadrant
              while quieter ones blend softly — densities read at a glance and
              shift gradually ("じわじわ") rather than snapping. Labels sit
              just outside the circle so the field inside stays clean. */}
          <div className="flex flex-col items-center gap-1.5">
            {silentSeconds >= 3 && (
              <div className="text-[11px] font-bold text-[#8a8178]">
                間 {silentSeconds.toFixed(1)}s
                {willProactive ? " ・ そろそろ話すかも" : ""}
              </div>
            )}
            <div className="relative h-[140px] w-[140px]">
              <div
                className="absolute inset-0 rounded-full border border-black/5 shadow-sm transition-all duration-700"
                style={{
                  background: `
                    radial-gradient(circle at 26% 26%, ${hexToRgba(emotionUI.joy.color, 0.12 + (emotion.joy ?? 0) * 0.78)} 0%, transparent 62%),
                    radial-gradient(circle at 74% 26%, ${hexToRgba(emotionUI.calm.color, 0.12 + (emotion.calm ?? 0) * 0.78)} 0%, transparent 62%),
                    radial-gradient(circle at 74% 74%, ${hexToRgba(emotionUI.anxiety.color, 0.12 + (emotion.anxiety ?? 0) * 0.78)} 0%, transparent 62%),
                    radial-gradient(circle at 26% 74%, ${hexToRgba(emotionUI.confusion.color, 0.12 + (emotion.confusion ?? 0) * 0.78)} 0%, transparent 62%),
                    #fff
                  `,
                }}
              />
              {(
                [
                  { e: "joy", x: "left-0", y: "top-0", align: "items-start" },
                  { e: "calm", x: "right-0", y: "top-0", align: "items-end" },
                  { e: "anxiety", x: "right-0", y: "bottom-0", align: "items-end" },
                  { e: "confusion", x: "left-0", y: "bottom-0", align: "items-start" },
                ] as const
              ).map(({ e, x, y, align }) => {
                const ee = e as Emotion;
                const pct = Math.round((emotion[ee] ?? 0) * 100);
                const isDom = ee === dom;
                return (
                  <div
                    key={e}
                    className={`absolute ${x} ${y} flex flex-col ${align} px-1 leading-tight transition-opacity`}
                    style={{ opacity: isDom ? 1 : 0.6 }}
                  >
                    <span
                      className="text-[10px] font-extrabold tabular-nums"
                      style={{ color: emotionUI[ee].color }}
                    >
                      {pct}%
                    </span>
                    <span className="text-[9px] font-bold text-[#8a8178]">
                      {EMOTION_LABEL[ee]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-w-[300px] rounded-[26px] border border-black/5 bg-white/85 px-5 py-4 text-center text-[17px] font-bold leading-relaxed text-[#49433d] shadow-sm backdrop-blur">
            {loading ? "考え中…" : lastMessage}
          </div>

          {/* "届き方" line. Surfaces the LLM-generated `receptionSummary`
              ("結論ファーストで好印象", "興味なさそうに聞こえたかも", …)
              right under the partner's reply. The LLM was already
              producing this every turn — we just hadn't been showing it.
              Renders only when present and not in the loading state so
              the bubble area stays clean during inference. */}
          {!loading && lastCharacterMessage?.receptionSummary && (
            <p className="max-w-[300px] text-center text-[12px] font-bold italic leading-relaxed text-[#7a5e1f]">
              — {lastCharacterMessage.receptionSummary}
            </p>
          )}

          <p className="max-w-[300px] text-center text-xs font-bold leading-relaxed text-[#8a8178]">
            {ui.helper}
          </p>
        </section>
        )}

        {ioMode === "chat" && (
          <>
            {/* Small character above the chat frame so the emotional read is
                always visible while the user is typing. The face/motion does
                the talking — color stays subtle by design. */}
            <div className="flex justify-center pt-1">
              <CharacterFace emotion={emotion} size={88} />
            </div>
          <section className="flex flex-1 flex-col min-h-0 overflow-hidden rounded-[28px] border border-black/5 bg-white/80 backdrop-blur">
            <div className="flex flex-col gap-1.5 border-b border-black/5 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#5f5a53]">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background: ui.color,
                      boxShadow: `0 0 8px ${ui.color}`,
                    }}
                  />
                  <span>{EMOTION_LABEL[dom]}</span>
                  <span style={{ color: ui.color }}>{percent}%</span>
                </div>
                <span className="text-[11px] font-bold text-[#8a8178]">
                  相手: {character.name}
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
                {EMOTIONS.map((e) => {
                  const p = (emotion[e] ?? 0) * 100;
                  return (
                    <div
                      key={e}
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${p}%`,
                        background: emotionUI[e].fill,
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <ConversationLog messages={messages} />
            {loading && (
              <p className="px-5 pb-2 text-[12px] font-bold text-[#8a8178]">
                考え中…
              </p>
            )}
          </section>
          </>
        )}

        {ioMode === "voice" && (
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
        )}

        {/* "完了" gate. Each episode declares a minTurns target so users
            can't tap-and-exit on the first hello — the practice has to
            actually happen. Until they hit the target we show a soft
            counter ("○○ / N 往復") that turns into the active complete
            button once they're there. */}
        {(() => {
          const userTurns = messages.filter((m) => m.role === "user").length;
          const target = Math.max(1, episode.minTurns);
          const ready = userTurns >= target;
          if (userTurns === 0) return null;
          if (!ready) {
            return (
              <p className="self-center rounded-full border border-black/5 bg-white/80 px-4 py-2 text-[12px] font-bold text-[#8a8178] shadow-sm">
                {userTurns} / {target} 往復・もう少し話せたら完了できます
              </p>
            );
          }
          return (
            <button
              onClick={() => onComplete(messages, Array.from(llmHitGoals))}
              type="button"
              className="self-center rounded-full border border-[#f4be42] bg-[#fff5d8] px-5 py-2.5 text-[13px] font-extrabold text-[#7a5e1f] shadow-sm transition active:scale-[0.99]"
            >
              ✓ この練習を完了する
            </button>
          );
        })()}

        <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-[28px] border border-black/5 bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur">
          {ioMode === "voice" && (
            <button
              onClick={handleMic}
              type="button"
              aria-label={recognition.running ? "マイクを止める" : "マイクを開始"}
              className={`grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full text-2xl shadow-sm transition-colors ${
                recognition.running
                  ? "bg-[#f4be42] animate-pulse"
                  : "bg-[#fff3d2]"
              }`}
            >
              🎤
            </button>
          )}

          <input
            value={text}
            onChange={(e) => {
              latestTextRef.current = e.target.value;
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              // e.nativeEvent.isComposing is true while the IME is
              // composing (henkan). Without this guard, the Enter that
              // confirms a Japanese conversion ends up submitting the
              // half-typed message.
              if (
                e.key === "Enter" &&
                !e.nativeEvent.isComposing &&
                !e.repeat
              ) {
                send();
              }
            }}
            placeholder={
              ioMode === "chat"
                ? loading
                  ? "考え中…"
                  : "メッセージを入力…"
                : isSpeaking
                ? "話しています…"
                : loading
                ? "考え中…"
                : recognition.running
                ? "聞いています… 黙ると送信されるよ"
                : "🎤を押して話す（またはタイプして Enter）"
            }
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[#49433d] outline-none placeholder:text-[#9c958d]"
          />

          {ioMode === "chat" && (
            <button
              onClick={() => send()}
              disabled={loading || !text.trim()}
              type="button"
              className="h-11 shrink-0 rounded-full bg-[#f4be42] px-5 text-[14px] font-extrabold text-[#2a241d] shadow-sm transition disabled:opacity-40"
            >
              送信
            </button>
          )}
        </div>

        {error && <p className="text-center text-xs text-red-500">{error}</p>}

        <BottomNav />
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

        @keyframes breathe {
          0%,
          100% {
            transform: translate(-50%, -50%) scale(0.88);
          }
          50% {
            transform: translate(-50%, -50%) scale(1.18);
          }
        }

        @keyframes wobble {
          0%,
          100% {
            transform: rotate(-2.5deg);
          }
          50% {
            transform: rotate(2.5deg);
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
