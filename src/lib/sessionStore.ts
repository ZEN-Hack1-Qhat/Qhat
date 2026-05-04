"use client";

import type { Message } from "./types";

// Opt-in browser-local persistence. Nothing leaves the device. The user can
// disable it from the review screen; the spec promises no server-side storage,
// so this lives entirely in localStorage.

export interface SavedSession {
  id: string;
  sceneId: string;
  startedAt: number;
  endedAt: number;
  messages: Message[];
  redoCount: number;
  feedback?: SessionFeedback;
}

export interface PerTurnFeedback {
  turnIndex: number;
  good?: string;
  better?: string;
  suggestion?: string;
  rating?: "good" | "ok" | "missed";
}

export interface SessionFeedback {
  perTurn: PerTurnFeedback[];
  strengths: string;
  challenges: string;
  nextLine: string;
  graduationDelta: number;
}

const STORAGE_KEY = "qhat:sessions:v1";
const SETTINGS_KEY = "qhat:settings:v1";
const GRADUATION_KEY = "qhat:graduation:v1";
const MAX_SAVED = 30;

interface Settings {
  saveSessions: boolean;
}

export function getSettings(): Settings {
  if (typeof window === "undefined") return { saveSessions: false };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { saveSessions: false };
    return JSON.parse(raw);
  } catch {
    return { saveSessions: false };
  }
}

export function setSettings(s: Settings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export function loadSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function saveSession(s: SavedSession) {
  if (typeof window === "undefined") return;
  try {
    const all = loadSessions();
    all.unshift(s);
    const trimmed = all.slice(0, MAX_SAVED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {}
}

export function clearSessions() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Graduation gauge per scene: 0..100. Each session moves the needle by a
// computed delta. Successful graduation = stays at 100 for one full session.
export function getGraduation(sceneId: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(GRADUATION_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw);
    return Math.max(0, Math.min(100, Number(map[sceneId] ?? 0)));
  } catch {
    return 0;
  }
}

export function bumpGraduation(sceneId: string, delta: number): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(GRADUATION_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const next = Math.max(0, Math.min(100, (map[sceneId] ?? 0) + delta));
    map[sceneId] = next;
    localStorage.setItem(GRADUATION_KEY, JSON.stringify(map));
    return next;
  } catch {
    return 0;
  }
}
