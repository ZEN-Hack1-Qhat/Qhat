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
  const [supported, setSupported] = useState(true);
  const [running, setRunning] = useState(false);
  const finalRef = useRef("");

  const cleanupAudio = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
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

  const resetFinal = useCallback(() => {
    finalRef.current = "";
  }, []);

  return { start, stop, supported, running, resetFinal };
}

export function speak(
  text: string,
  opts?: {
    pitch?: number;
    rate?: number;
    lang?: string;
    onEnd?: () => void;
    onError?: () => void;
  }
) {
  if (typeof window === "undefined") {
    opts?.onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    opts?.onEnd?.();
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = opts?.lang ?? "ja-JP";
  u.pitch = opts?.pitch ?? 1.0;
  u.rate = opts?.rate ?? 1.0;
  let settled = false;
  const settle = (fn?: () => void) => {
    if (settled) return;
    settled = true;
    fn?.();
  };
  u.onend = () => settle(opts?.onEnd);
  u.onerror = () => settle(opts?.onError ?? opts?.onEnd);
  // Safety net: if onend never fires (tab inactive, OS quirk), force-resolve
  // proportional to text length so the UI never gets stuck on "speaking".
  const timeoutMs = Math.min(20_000, 2_000 + text.length * 180);
  setTimeout(() => settle(opts?.onEnd), timeoutMs);
  synth.cancel();
  synth.speak(u);
}
