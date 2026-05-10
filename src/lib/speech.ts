"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// Tailored permission-recovery instructions per platform. Once iOS Safari
// records "denied", there is no in-page way to re-prompt — the user has to
// reset the per-site permission via Settings or the page-info menu. Telling
// a desktop user to look at "the address bar" makes sense; telling an iPhone
// user the same thing leaves them stuck since iOS Safari has no clickable
// permission icon there.
function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as Mac; treat touch-capable Safari as iOS.
    (ua.includes("Mac") && (navigator as any).maxTouchPoints > 1)
  );
}

// Detect Home Screen / PWA mode. iOS Safari deliberately disables
// webkitSpeechRecognition when the page runs as a standalone web app
// (per WebKit bug 225298) — must be opened in regular Safari instead.
function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  if (w.navigator?.standalone === true) return true;
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function micPermissionMessage(): string {
  if (isIOSSafari()) {
    return "マイクが許可されていません。iPhoneの「設定」アプリ → Safari → 「マイク」を「許可」にしてから、このページを更新してください。";
  }
  return "マイクが許可されていません。アドレスバー左の鍵マーク → サイト設定 → マイクを「許可」にして、ページを再読み込みしてください。";
}

// iOS Safari's webkitSpeechRecognition silently relies on the system
// Dictation backend. If "設定 → 一般 → キーボード → 音声入力" is OFF, the
// API throws service-not-allowed without ever showing a permission popup,
// which is the #1 reason "the mic does nothing" on iPhone. Tell the user
// exactly which switch to flip.
function speechServiceMessage(): string {
  if (isStandalonePWA()) {
    return "ホーム画面から開いた状態では音声認識が使えません（iOS Safariの仕様）。一度Safariブラウザでこのページを開き直してください。";
  }
  if (isIOSSafari()) {
    return "音声認識を使うには iPhone の「設定 → 一般 → キーボード → 音声入力」をオンにしてください（マイク許可とは別の設定です）。変更後、Safariを一度終了→再起動して、このページをリロードしてください。";
  }
  return "音声認識サービスが使えません。OSの音声入力／ディクテーション設定を確認してください。";
}

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

interface UseRecognitionOptions {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onLevel?: (rms: number) => void;
  // Surface SpeechRecognition errors (mic permission denied, network, etc.)
  // and start() throws so the UI can show the user *why* the mic seems dead
  // instead of silently no-op'ing. Without this, iOS Safari quirks (HTTPS
  // missing, mic blocked) look identical to "tapped, nothing happened".
  onError?: (message: string) => void;
  lang?: string;
}

export function useSpeechRecognition({
  onInterim,
  onFinal,
  onLevel,
  onError,
  lang = "ja-JP",
}: UseRecognitionOptions) {
  // Latest-callback refs keep handlers stable so SR is created exactly once.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onLevelRef = useRef(onLevel);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onInterimRef.current = onInterim;
    onFinalRef.current = onFinal;
    onLevelRef.current = onLevel;
    onErrorRef.current = onError;
  }, [onInterim, onFinal, onLevel, onError]);

  const recRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // MediaRecorder + chunks store the raw utterance audio so we can ship it to
  // a local Whisper server for higher-accuracy transcription on submit. The
  // browser's SpeechRecognition runs in parallel and provides the live preview
  // + the fallback final text when Whisper isn't available.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [supported, setSupported] = useState(true);
  const [running, setRunning] = useState(false);
  const finalRef = useRef("");
  // iOS Safari ignores `continuous = true` and ends recognition after each
  // utterance. We auto-restart while the user expects the mic to be on so
  // they can keep talking without re-tapping. Set true on start(), false on
  // explicit stop() so onend can decide whether to relaunch.
  const keepAliveRef = useRef(false);
  // Watchdog: if SR runs for >6s without producing any transcript AND no
  // detectable audio level, iOS Safari has likely silently failed (Dictation
  // setting OFF is the usual culprit). Surface a hint so the user isn't
  // staring at a pulsing mic that never picks anything up.
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sawAudioRef = useRef(false);
  const sawTranscriptRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    // Stop the MediaRecorder if it's still running. Callers that want the
    // captured audio (stopAndGetAudio) will have already pulled it; this is
    // the discard path used by stop() and the chat-mode auto-stop.
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch {}
    recorderRef.current = null;
    chunksRef.current = [];
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r: any = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final || interim) sawTranscriptRef.current = true;
      if (final) {
        finalRef.current += final;
        onFinalRef.current?.(finalRef.current);
      }
      if (interim) {
        onInterimRef.current?.(finalRef.current + interim);
      }
    };
    rec.onerror = (e: any) => {
      // Map the most common SpeechRecognition error codes to user-readable JP
      // hints. 'no-speech' is benign (silence timeout); we swallow it so the
      // UI doesn't shout at the user for not talking yet. Everything else
      // gets surfaced — silently ignoring these is what made the iPhone
      // "tap does nothing" symptom impossible to diagnose.
      const code = e?.error ?? "unknown";
      if (code === "no-speech" || code === "aborted") return;
      // service-not-allowed is the trap: code-wise it sounds like permission
      // issues, but on iOS Safari the most common cause is "Settings →
      // 一般 → キーボード → 音声入力" being OFF. Spell that out.
      const map: Record<string, string> = {
        "not-allowed": micPermissionMessage(),
        "service-not-allowed": speechServiceMessage(),
        "audio-capture": "マイクが見つかりません。",
        network:
          "ネットワークエラーで音声認識が止まりました。接続を確認してください。",
      };
      // service-not-allowed is also fatal — don't auto-restart, that just
      // burns retries against a setting the user has to change manually.
      if (code === "service-not-allowed" || code === "not-allowed") {
        keepAliveRef.current = false;
      }
      onErrorRef.current?.(map[code] ?? `音声認識エラー: ${code}`);
    };
    rec.onend = () => {
      // iOS Safari fires onend after each utterance even with continuous=true.
      // Auto-relaunch while the user still wants the mic on, so the recording
      // session feels continuous from their side. A small delay gives Safari
      // time to release the previous recognition session — restarting too
      // quickly can itself trigger service-not-allowed.
      if (keepAliveRef.current) {
        setTimeout(() => {
          if (!keepAliveRef.current) return;
          try {
            rec.start();
          } catch {
            // start() can throw if SR is mid-state; the next user tap will
            // recover. Don't surface — this is the routine restart path.
            setRunning(false);
          }
        }, 150);
        return;
      }
      setRunning(false);
    };
    recRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {}
      cleanupAudio();
      recRef.current = null;
    };
  }, [lang, cleanupAudio]);

  const start = useCallback(async () => {
    if (!recRef.current) return;
    finalRef.current = "";
    chunksRef.current = [];
    keepAliveRef.current = true;
    sawAudioRef.current = false;
    sawTranscriptRef.current = false;
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    // Two-failure-modes watchdog. Wait long enough to cover normal pauses
    // (15s), then split the diagnosis based on what we *did* see:
    //   - No audio + no transcript → SR didn't even start; usually Dictation
    //     OFF or PWA mode (speechServiceMessage covers both).
    //   - Audio detected but no transcript → mic works, speech recognition
    //     itself failed to convert. Apple's online STT couldn't process —
    //     network, account region, or a Safari quirk. Different fix path.
    watchdogRef.current = setTimeout(() => {
      if (!keepAliveRef.current) return;
      if (sawTranscriptRef.current) return;
      if (sawAudioRef.current) {
        onErrorRef.current?.(
          "音声は届いていますが、文字に変換できませんでした。一度マイクを止めて、もう一度お試しください。改善しない場合は通信状況を確認するか、Safariを再起動してください。"
        );
      } else {
        onErrorRef.current?.(speechServiceMessage());
      }
      keepAliveRef.current = false;
      try {
        recRef.current?.stop();
      } catch {}
    }, 15_000);

    // CRITICAL on iOS Safari: SpeechRecognition.start() must be called
    // synchronously inside the user-gesture handler. If we await
    // getUserMedia first, the gesture token is consumed and start()
    // throws InvalidStateError silently — the mic button "does nothing".
    // So we kick off SR first, then bring up audio analysis async.
    try {
      recRef.current.start();
      setRunning(true);
    } catch (err: any) {
      keepAliveRef.current = false;
      // iOS Safari throws here when the page isn't HTTPS, mic permission
      // is blocked, or start() is called outside a user gesture. Surface
      // it to the UI so the user can see *why* the mic seems dead.
      console.warn("SpeechRecognition.start() failed:", err);
      onErrorRef.current?.(
        `マイクを起動できませんでした: ${err?.message ?? err?.name ?? "unknown"}`
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // 0.02 RMS is well above noise floor on a typical phone mic — once
        // we cross it we know the user has *something* coming through, so
        // the watchdog can stop suspecting silent failure.
        if (rms > 0.02) sawAudioRef.current = true;
        onLevelRef.current?.(rms);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Best-effort utterance capture for Whisper. webm/opus is the most
      // widely supported container; Safari falls back to its default mp4
      // encoding which faster-whisper-server still handles via ffmpeg.
      try {
        const preferredMime = MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : undefined;
        const recorder = new MediaRecorder(
          stream,
          preferredMime ? { mimeType: preferredMime } : undefined
        );
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start();
        recorderRef.current = recorder;
      } catch {
        // MediaRecorder unsupported on this browser — Whisper hybrid skipped,
        // recognition still works via Web Speech API.
      }
    } catch (err: any) {
      // mic access denied — SR is already running but on iOS Safari, SR
      // *also* depends on this same permission, so transcripts won't come
      // either. Surface so the user knows to grant permission.
      const name = err?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        keepAliveRef.current = false;
        onErrorRef.current?.(micPermissionMessage());
      }
    }
  }, []);

  const stop = useCallback(() => {
    keepAliveRef.current = false;
    try {
      recRef.current?.stop();
    } catch {}
    cleanupAudio();
    setRunning(false);
  }, [cleanupAudio]);

  // Like stop(), but waits for MediaRecorder to flush its chunks and returns
  // the captured utterance as a Blob. Caller passes the Blob to Whisper for
  // a higher-accuracy transcription. Returns null if no audio was captured
  // (mic denied, MediaRecorder unsupported, etc.).
  const stopAndGetAudio = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      keepAliveRef.current = false;
      const rec = recorderRef.current;
      recorderRef.current = null;

      const finalize = (blob: Blob | null) => {
        try {
          recRef.current?.stop();
        } catch {}
        // cleanupAudio also stops the recorder if it's still alive, but we've
        // already captured/released it here. It's safe to call again — the
        // try/catch around recorder.stop() inside cleanupAudio absorbs the
        // "already inactive" error.
        cleanupAudio();
        setRunning(false);
        resolve(blob);
      };

      if (!rec || rec.state === "inactive") {
        finalize(null);
        return;
      }

      rec.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        if (chunks.length === 0) {
          finalize(null);
          return;
        }
        finalize(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };

      try {
        rec.stop();
      } catch {
        finalize(null);
      }
    });
  }, [cleanupAudio]);

  const resetFinal = useCallback(() => {
    finalRef.current = "";
  }, []);

  return { start, stop, stopAndGetAudio, supported, running, resetFinal };
}

// ---------------------------------------------------------------------------
// Whisper (faster-whisper-server, OpenAI-compatible) integration
// ---------------------------------------------------------------------------
// Same shape as the VOICEVOX integration above: probe a localhost port,
// cache the result, expire negative probes after 5s so users can launch
// the server mid-session and have it picked up automatically.

const WHISPER_BASE = "http://localhost:8000";
// faster-whisper-server accepts any string in the `model` field — it uses
// whatever model is configured server-side via WHISPER__MODEL. "whisper-1"
// is OpenAI's reference name and works as a safe placeholder.
const WHISPER_MODEL = "Systran/faster-whisper-large-v3";

let whisperAvailable: boolean | null = null;
let lastWhisperProbeAt = 0;
const WHISPER_NEG_RECHECK_MS = 5_000;

// Whisper/VOICEVOX both run on localhost on the dev box. When the page is
// loaded over a tunnel (cloudflared) or directly from a phone via LAN IP,
// "localhost" resolves to the *phone*, not the Mac — and on HTTPS pages
// browsers also block http://localhost as mixed content. Either way the
// probe always fails. Detecting that and skipping the probe entirely
// removes 800ms of wasted timeout per turn from non-dev devices.
function localhostUnreachable(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
}

export async function isWhisperAvailable(): Promise<boolean> {
  if (localhostUnreachable()) return false;
  if (whisperAvailable === true) return true;
  if (
    whisperAvailable === false &&
    Date.now() - lastWhisperProbeAt < WHISPER_NEG_RECHECK_MS
  ) {
    return false;
  }
  lastWhisperProbeAt = Date.now();
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 800);
    const res = await fetch(`${WHISPER_BASE}/v1/models`, { signal: ctl.signal });
    clearTimeout(t);
    whisperAvailable = res.ok;
  } catch {
    whisperAvailable = false;
  }
  return whisperAvailable;
}

// Send the captured utterance to faster-whisper-server. Returns the text on
// success, or null on any failure so the caller can silently fall back to
// the Web Speech API result. Skips on suspiciously tiny blobs (< 1 KB) which
// are usually dropouts or interrupted recordings.
export async function transcribeWithWhisper(
  blob: Blob
): Promise<string | null> {
  if (blob.size < 1024) return null;
  if (!(await isWhisperAvailable())) return null;
  try {
    const ext = blob.type.includes("mp4")
      ? "mp4"
      : blob.type.includes("ogg")
      ? "ogg"
      : "webm";
    const form = new FormData();
    form.append("file", blob, `utterance.${ext}`);
    form.append("model", WHISPER_MODEL);
    form.append("language", "ja");
    form.append("response_format", "json");

    const ctl = new AbortController();
    // Whisper is fast on local hardware (~0.5–2s for short utterances), but
    // we cap the wait so a hung server doesn't freeze the UI past the
    // existing LLM latency budget.
    const t = setTimeout(() => ctl.abort(), 8_000);
    const res = await fetch(`${WHISPER_BASE}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.text === "string" ? data.text.trim() : null;
  } catch {
    return null;
  }
}

// VOICEVOX engine endpoint. The desktop app exposes this on localhost.
const VOICEVOX_BASE = "http://localhost:50021";

// Cache availability so we don't probe before every utterance. Positive
// results stick (engine doesn't usually go down mid-session); negative
// results expire after 5s so the engine starts being used the moment the
// user launches VOICEVOX without needing a page refresh.
let voicevoxAvailable: boolean | null = null;
let lastNegProbeAt = 0;
const NEG_RECHECK_MS = 5_000;

async function isVoicevoxAvailable(): Promise<boolean> {
  if (localhostUnreachable()) return false;
  if (voicevoxAvailable === true) return true;
  if (
    voicevoxAvailable === false &&
    Date.now() - lastNegProbeAt < NEG_RECHECK_MS
  ) {
    return false;
  }
  lastNegProbeAt = Date.now();
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 800);
    const res = await fetch(`${VOICEVOX_BASE}/version`, { signal: ctl.signal });
    clearTimeout(t);
    voicevoxAvailable = res.ok;
  } catch {
    voicevoxAvailable = false;
  }
  return voicevoxAvailable;
}

// Track the currently playing audio element so we can cancel before starting
// the next utterance (mirrors browser synth.cancel()).
let currentAudio: HTMLAudioElement | null = null;
function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

interface SpeakOpts {
  pitch?: number;
  rate?: number;
  lang?: string;
  voicevoxSpeakerId?: number;
  onEnd?: () => void;
  onError?: () => void;
}

async function speakViaVoicevox(
  text: string,
  speakerId: number,
  opts: SpeakOpts
): Promise<boolean> {
  try {
    // 1. audio_query — engine returns mora-level speech params we can tweak.
    const queryRes = await fetch(
      `${VOICEVOX_BASE}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`,
      { method: "POST" }
    );
    if (!queryRes.ok) return false;
    const query = await queryRes.json();
    // Map the existing pitch/rate dials to VOICEVOX's analogous fields. Both
    // are bounded to safe-ish ranges so the voice never sounds chipmunked.
    if (typeof opts.rate === "number") {
      query.speedScale = Math.max(0.5, Math.min(2.0, opts.rate));
    }
    if (typeof opts.pitch === "number") {
      // pitch in browser TTS centers at 1.0; VOICEVOX pitchScale centers at 0.
      query.pitchScale = Math.max(-0.15, Math.min(0.15, (opts.pitch - 1) * 0.15));
    }

    // 2. synthesis — returns a WAV buffer of the rendered speech.
    const synRes = await fetch(
      `${VOICEVOX_BASE}/synthesis?speaker=${speakerId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      }
    );
    if (!synRes.ok) return false;
    const blob = await synRes.blob();
    const url = URL.createObjectURL(blob);
    stopCurrentAudio();
    const audio = new Audio(url);
    currentAudio = audio;
    let settled = false;
    const settle = (fn?: () => void) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      fn?.();
    };
    audio.onended = () => settle(opts.onEnd);
    audio.onerror = () => settle(opts.onError ?? opts.onEnd);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

// Chrome populates speechSynthesis.getVoices() asynchronously. If we speak
// before that finishes, the lang hint is ignored and the browser may pick a
// silent locale. Wait once at startup and cache the resolved voice list.
function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    let voices = synth.getVoices();
    if (voices.length) return resolve(voices);
    const handler = () => {
      voices = synth.getVoices();
      synth.removeEventListener("voiceschanged", handler);
      resolve(voices);
    };
    synth.addEventListener("voiceschanged", handler);
    // Belt-and-braces: some browsers never fire voiceschanged. Resolve after
    // a reasonable wait with whatever's there.
    setTimeout(() => {
      synth.removeEventListener("voiceschanged", handler);
      resolve(synth.getVoices());
    }, 800);
  });
}

async function speakViaBrowser(text: string, opts: SpeakOpts) {
  if (typeof window === "undefined") {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    opts.onEnd?.();
    return;
  }

  const voices = await getVoices();
  const lang = opts.lang ?? "ja-JP";
  // Prefer a Japanese voice; fall back to anything Latin if the OS has no
  // Japanese pack installed (common on Windows / fresh macOS). Without this
  // fallback, speak() silently no-ops on machines without Kyoko/Otoya.
  const jaVoice =
    voices.find((v) => v.lang === lang) ||
    voices.find((v) => v.lang.startsWith("ja"));
  const fallbackVoice = jaVoice || voices[0] || null;

  const u = new SpeechSynthesisUtterance(text);
  if (fallbackVoice) u.voice = fallbackVoice;
  u.lang = jaVoice?.lang ?? fallbackVoice?.lang ?? lang;
  u.pitch = opts.pitch ?? 1.0;
  u.rate = opts.rate ?? 1.0;

  let settled = false;
  let started = false;
  const settle = (fn?: () => void) => {
    if (settled) return;
    settled = true;
    fn?.();
  };
  u.onstart = () => {
    started = true;
  };
  u.onend = () => settle(opts.onEnd);
  u.onerror = (e) => {
    // Surface to console so dev can see why audio is silent (e.g.
    // not-allowed = autoplay policy, audio-busy = OS-level block).
    console.warn("speechSynthesis error:", (e as SpeechSynthesisErrorEvent).error);
    settle(opts.onError ?? opts.onEnd);
  };
  synth.cancel();
  synth.speak(u);

  // Two-stage safety net:
  //   (a) If onstart hasn't fired within 1500ms, the TTS engine didn't
  //       actually start (iOS Safari silent-fail, no JP voice installed,
  //       etc.) — release isSpeaking immediately so the UI doesn't sit
  //       frozen waiting on phantom audio.
  //   (b) If onstart did fire but onend never does (tab inactive, iOS
  //       quirk), fall back to a length-based estimate. JP TTS averages
  //       ~120ms per character; cap at 8s instead of the previous 20s
  //       so a stuck utterance doesn't soft-lock the auto-listen loop.
  setTimeout(() => {
    if (!started) settle(opts.onEnd);
  }, 1_500);
  const lenBasedMs = Math.min(8_000, 1_500 + text.length * 120);
  setTimeout(() => settle(opts.onEnd), lenBasedMs);

  if (!voices.length) {
    console.warn(
      "speechSynthesis: no voices available. On macOS install a JP voice " +
        "(System Settings → Accessibility → Spoken Content → System Voice → " +
        "Manage Voices → Japanese)."
    );
  }
}

export function speak(text: string, opts?: SpeakOpts) {
  const o = opts ?? {};
  // If a VOICEVOX speaker is configured, try it first. The first call probes
  // the engine; subsequent calls use the cached availability.
  if (typeof o.voicevoxSpeakerId === "number") {
    isVoicevoxAvailable().then((ok) => {
      if (!ok) return speakViaBrowser(text, o);
      speakViaVoicevox(text, o.voicevoxSpeakerId!, o).then((played) => {
        if (!played) speakViaBrowser(text, o);
      });
    });
    return;
  }
  speakViaBrowser(text, o);
}
