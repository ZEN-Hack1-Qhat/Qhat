import type { Emotion, EmotionProbs, Message, Role } from "./types";

const EMOTION_KEYS: Emotion[] = ["joy", "calm", "anxiety", "confusion"];

const ALLOWED_CHARACTER_IDS = new Set([
  // Original cast
  "sakura",
  "takahashi",
  "tanaka",
  // Story arc additions (Days 1–10, 28)
  "clerk_morino",
  "bus_kaito",
  "team_yuki",
]);
const ALLOWED_SCENE_IDS = new Set([
  // Original 3 scenarios — also Days 14/21/25 of the story arc
  "kanto_offline",
  "job_interview",
  "senpai_ask",
  // Story arc Days 1/3/5/7/10
  "convenience_store",
  "bus_stop_morning",
  "bus_stop_echo",
  "team_one_question",
  "team_recovery",
  // Story arc Days 17, 28
  "sakura_cafe",
  "team_initiate",
  // Legacy fallback used in early prototypes — kept until all clients are
  // updated to send a real scene id.
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
  // Goals the LLM should evaluate against the user's latest message. Only
  // semantic goals come through here — emotion-threshold and length-based
  // goals are evaluated deterministically client-side.
  goalsToJudge: { id: string; label: string }[];
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

  // goals_to_judge: ids + labels only, capped tightly. We don't need the
  // full Goal type on the wire — the LLM only judges by label.
  let goalsToJudge: { id: string; label: string }[] = [];
  const rawGoals = raw.goals_to_judge;
  if (Array.isArray(rawGoals)) {
    goalsToJudge = rawGoals
      .filter((g): g is Record<string, unknown> => isPlainObject(g))
      .map((g) => ({
        id: typeof g.id === "string" ? g.id.slice(0, 64) : "",
        label: typeof g.label === "string" ? g.label.slice(0, 200) : "",
      }))
      .filter((g) => g.id.length > 0 && g.label.length > 0)
      .slice(0, 6);
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
    goalsToJudge,
  };
}
