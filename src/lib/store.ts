"use client";

import { create } from "zustand";
import type { EmotionProbs, Message, Scene } from "./types";
import { dominant } from "./emotion";

interface QhatState {
  scene: Scene | null;
  messages: Message[];
  emotion: EmotionProbs;
  prevEmotion: EmotionProbs;
  decoherence: number;
  redoCount: number;
  proactiveCount: number;
  lastProactiveAt: number;
  lastInteractionAt: number;
  proactiveEnabled: boolean;
  draftText: string;
  isRecording: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  // Accumulated facts about the practitioner that the LLM has learned.
  keyFacts: string[];
  setScene: (scene: Scene) => void;
  reset: () => void;
  pushMessage: (m: Message) => void;
  updateEmotion: (e: EmotionProbs) => void;
  setDecoherence: (v: number) => void;
  bumpDecoherence: (delta: number) => void;
  setDraft: (s: string) => void;
  setRecording: (b: boolean) => void;
  setThinking: (b: boolean) => void;
  setSpeaking: (b: boolean) => void;
  incRedo: () => void;
  resetRedo: () => void;
  registerInteraction: () => void;
  registerProactive: () => void;
  toggleProactive: () => void;
  addKeyFacts: (facts: string[]) => void;
}

const initial = {
  scene: null,
  messages: [] as Message[],
  emotion: { joy: 0.25, calm: 0.25, anxiety: 0.25, confusion: 0.25 },
  prevEmotion: { joy: 0.25, calm: 0.25, anxiety: 0.25, confusion: 0.25 },
  decoherence: 0,
  redoCount: 0,
  proactiveCount: 0,
  lastProactiveAt: 0,
  lastInteractionAt: Date.now(),
  proactiveEnabled: true,
  draftText: "",
  isRecording: false,
  isThinking: false,
  isSpeaking: false,
  keyFacts: [] as string[],
};

export const useQhat = create<QhatState>((set, get) => ({
  ...initial,
  setScene: (scene) =>
    set({
      ...initial,
      scene,
      emotion: scene.initialEmotion,
      prevEmotion: scene.initialEmotion,
      lastInteractionAt: Date.now(),
      messages: scene.openingLine
        ? [
            {
              id: "msg_opening",
              role: "character",
              speaker: scene.characterId,
              text: scene.openingLine,
              timestamp: Date.now(),
              emotion: scene.initialEmotion,
              dominant: dominant(scene.initialEmotion),
            },
          ]
        : [],
    }),
  reset: () => set({ ...initial }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  updateEmotion: (e) =>
    set((s) => ({ prevEmotion: s.emotion, emotion: e })),
  setDecoherence: (v) => set({ decoherence: Math.max(0, Math.min(100, v)) }),
  bumpDecoherence: (d) =>
    set((s) => ({
      decoherence: Math.max(0, Math.min(100, s.decoherence + d)),
    })),
  setDraft: (s) => set({ draftText: s }),
  setRecording: (b) => set({ isRecording: b }),
  setThinking: (b) => set({ isThinking: b }),
  setSpeaking: (b) => set({ isSpeaking: b }),
  incRedo: () => set((s) => ({ redoCount: s.redoCount + 1 })),
  resetRedo: () => set({ redoCount: 0 }),
  registerInteraction: () => set({ lastInteractionAt: Date.now() }),
  registerProactive: () =>
    set((s) => ({
      proactiveCount: s.proactiveCount + 1,
      lastProactiveAt: Date.now(),
    })),
  toggleProactive: () =>
    set((s) => ({ proactiveEnabled: !s.proactiveEnabled })),
  addKeyFacts: (facts) =>
    set((s) => {
      if (facts.length === 0) return s;
      const merged = [...s.keyFacts];
      for (const f of facts) {
        const trimmed = f.trim();
        if (!trimmed) continue;
        if (!merged.some((existing) => existing === trimmed)) merged.push(trimmed);
      }
      // Keep memory bounded; old facts decay first.
      return { keyFacts: merged.slice(-30) };
    }),
}));
