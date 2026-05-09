"use client";

import { useEffect, useRef, useCallback, useState } from "react";

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
  lang?: string;
}

export function useSpeechRecognition({
  onInterim,
  onFinal,
  onLevel,
  lang = "ja-JP",
}: UseRecognitionOptions) {
  // Latest-callback refs keep handlers stable so SR is created exactly once.
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onLevelRef = useRef(onLevel);
  useEffect(() => {
    onInterimRef.current = onInterim;
    onFinalRef.current = onFinal;
    onLevelRef.current = onLevel;
  }, [onInterim, onFinal, onLevel]);

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

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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
      if (final) {
        finalRef.current += final;
        onFinalRef.current?.(finalRef.current);
      }
      if (interim) {
        onInterimRef.current?.(finalRef.current + interim);
      }
    };
    rec.onerror = () => {};
    rec.onend = () => setRunning(false);
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
        onLevelRef.current?.(Math.sqrt(sum / buf.length));
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
    } catch {
      // mic access denied — recognition continues without level meter
    }
    try {
      recRef.current.start();
      setRunning(true);
    } catch {}
  }, []);

  const stop = useCallback(() => {
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

export async function isWhisperAvailable(): Promise<boolean> {
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

function speakViaBrowser(text: string, opts: SpeakOpts) {
  if (typeof window === "undefined") {
    opts.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    opts.onEnd?.();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts.lang ?? "ja-JP";
  u.pitch = opts.pitch ?? 1.0;
  u.rate = opts.rate ?? 1.0;
  let settled = false;
  const settle = (fn?: () => void) => {
    if (settled) return;
    settled = true;
    fn?.();
  };
  u.onend = () => settle(opts.onEnd);
  u.onerror = () => settle(opts.onError ?? opts.onEnd);
  // Safety net: if onend never fires (tab inactive, OS quirk), force-resolve
  // proportional to text length so the UI never gets stuck on "speaking".
  const timeoutMs = Math.min(20_000, 2_000 + text.length * 180);
  setTimeout(() => settle(opts.onEnd), timeoutMs);
  synth.cancel();
  synth.speak(u);
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
