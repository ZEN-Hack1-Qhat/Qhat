import type { Emotion, EmotionProbs, Message, Role } from "./types";

const EMOTION_KEYS: Emotion[] = ["joy", "calm", "anxiety", "confusion"];

const ALLOWED_CHARACTER_IDS = new Set(["sakura", "takahashi", "tanaka"]);
const ALLOWED_SCENE_IDS = new Set([
  "kanto_offline",
  "job_interview",
  "senpai_ask",
  "custom",
]);
// const ALLOWED_SCENE_IDS = new Set([
//   "kanto_offline",
//   "job_interview",
//   "senpai_ask",
// ]);

export class ValidationError extends Error {}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export interface ValidatedTurnRequest {
  userText: string;
  prevEmotion: EmotionProbs;
  characterId: string;
  sceneId: string;
  redoCount: number;
  proactive: boolean;
  expand: boolean;
  history: Message[];
  keyFacts: string[];
}

const MAX_USER_TEXT = 2000;
const MAX_REDO_COUNT = 1000;
const MAX_HISTORY = 60;
const MAX_HISTORY_MSG_LEN = 1500;

function validateMessage(raw: unknown): Message | null {
  if (!isPlainObject(raw)) return null;
  const role = raw.role;
  if (role !== "user" && role !== "character") return null;
  const text = raw.text;
  if (typeof text !== "string" || text.length === 0) return null;
  if (text.length > MAX_HISTORY_MSG_LEN) return null;
  return {
    id: typeof raw.id === "string" ? raw.id : `m_${Math.random()}`,
    role: role as Role,
    text,
    timestamp:
      typeof raw.timestamp === "number" && Number.isFinite(raw.timestamp)
        ? raw.timestamp
        : Date.now(),
    speaker: typeof raw.speaker === "string" ? raw.speaker : undefined,
  };
}

export function validateTurnRequest(raw: unknown): ValidatedTurnRequest {
  if (!isPlainObject(raw)) throw new ValidationError("body must be a JSON object");

  const userText = raw.user_text;
  if (typeof userText !== "string") throw new ValidationError("user_text must be string");
  if (userText.length > MAX_USER_TEXT) throw new ValidationError("user_text too long");

  const characterId = raw.character_id;
  if (typeof characterId !== "string" || !ALLOWED_CHARACTER_IDS.has(characterId)) {
    throw new ValidationError("invalid character_id");
  }

  const sceneId = typeof raw.scene_id === "string" ? raw.scene_id : "";
  if (sceneId && !ALLOWED_SCENE_IDS.has(sceneId)) {
    throw new ValidationError("invalid scene_id");
  }

  const prev = raw.prev_emotion;
  if (!isPlainObject(prev)) throw new ValidationError("prev_emotion must be object");
  const prevEmotion = {} as EmotionProbs;
  for (const k of EMOTION_KEYS) {
    const v = (prev as Record<string, unknown>)[k];
    if (!isFiniteNumber(v) || v < 0 || v > 1) {
      throw new ValidationError(`prev_emotion.${k} must be number in [0,1]`);
    }
    prevEmotion[k] = v;
  }

  const redoCount = raw.redo_count ?? 0;
  if (!isFiniteNumber(redoCount) || redoCount < 0 || redoCount > MAX_REDO_COUNT) {
    throw new ValidationError("invalid redo_count");
  }

  // Conversation history is optional (mock can run without it). Cap length so
  // a malicious caller can't blow up the LLM context window.
  let history: Message[] = [];
  const rawHistory = raw.history;
  if (Array.isArray(rawHistory)) {
    if (rawHistory.length > MAX_HISTORY) {
      throw new ValidationError("history too long");
    }
    history = rawHistory
      .map(validateMessage)
      .filter((m): m is Message => m !== null);
  }

  let keyFacts: string[] = [];
  const rawFacts = raw.key_facts;
  if (Array.isArray(rawFacts)) {
    keyFacts = rawFacts
      .filter(
        (f): f is string =>
          typeof f === "string" && f.trim().length > 0 && f.length <= 200
      )
      .slice(0, 30);
  }

  return {
    userText,
    prevEmotion,
    characterId,
    sceneId,
    redoCount: Math.floor(redoCount),
    proactive: raw.proactive === true,
    expand: raw.expand === true,
    history,
    keyFacts,
  };
}
