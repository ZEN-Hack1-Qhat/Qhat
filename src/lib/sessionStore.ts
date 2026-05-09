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
const LAST_SCENE_KEY = "qhat:last_scene:v1";
const STORY_PROGRESS_KEY = "qhat:story_progress:v1";
const EFFECTIVE_LINES_KEY = "qhat:effective_lines:v1";
const MAX_SAVED = 30;
const MAX_EFFECTIVE_LINES = 50;

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
    // Upsert by id so an in-progress session can be saved repeatedly as the
    // conversation grows, instead of duplicating into the list each turn.
    const idx = all.findIndex((x) => x.id === s.id);
    if (idx >= 0) all[idx] = s;
    else all.unshift(s);
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

// Last scene the user opened — used by the home "start" button to pick a
// recommended scene and let users continue where they left off without
// re-choosing every time.
export function getLastScene(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_SCENE_KEY);
  } catch {
    return null;
  }
}

export function setLastScene(sceneId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_SCENE_KEY, sceneId);
  } catch {}
}

// ---------------------------------------------------------------------------
// Story progress: which days the user has completed.
// ---------------------------------------------------------------------------
// Stored as a flat array of episode ids so the schema is human-readable in
// devtools and trivial to migrate. Order reflects completion order, which
// also gives us a "last finished" hook for free.

export function getStoryProgress(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORY_PROGRESS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function markEpisodeComplete(episodeId: string) {
  if (typeof window === "undefined") return;
  try {
    const list = getStoryProgress();
    if (list.includes(episodeId)) return; // idempotent — replays don't dupe
    list.push(episodeId);
    localStorage.setItem(STORY_PROGRESS_KEY, JSON.stringify(list));
  } catch {}
}

export function resetStoryProgress() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORY_PROGRESS_KEY);
  } catch {}
}

// ---------------------------------------------------------------------------
// "響いたセリフ": user lines that produced a clearly positive emotion shift
// in the partner. Recorded silently during conversations and surfaced on
// the Day-30 reflection so the practitioner can see "these are the words
// that worked for me" — concrete proof of progress, not just a count.
// ---------------------------------------------------------------------------

export interface EffectiveLine {
  text: string;
  episodeId: string;
  characterId: string;
  // What changed and how much. Used to sort + label the entry ("不安が
  // 大きく下がった" vs "喜びが上がった").
  emotion: "joy" | "calm" | "anxiety" | "confusion";
  delta: number;
  timestamp: number;
}

export function getEffectiveLines(): EffectiveLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(EFFECTIVE_LINES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveEffectiveLine(line: EffectiveLine) {
  if (typeof window === "undefined") return;
  try {
    const all = getEffectiveLines();
    // Dedupe near-identical entries (same text + character) so replays
    // don't flood the reflection with the same line over and over.
    const filtered = all.filter(
      (l) => !(l.text === line.text && l.characterId === line.characterId)
    );
    filtered.unshift(line);
    const trimmed = filtered.slice(0, MAX_EFFECTIVE_LINES);
    localStorage.setItem(EFFECTIVE_LINES_KEY, JSON.stringify(trimmed));
  } catch {}
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
