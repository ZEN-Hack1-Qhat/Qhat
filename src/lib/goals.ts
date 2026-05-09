// Per-episode "small goals" — concrete, observable moves the user can try
// inside a conversation. They're informational (the conversation never
// blocks waiting for a goal), but they make the practice target tangible
// instead of leaving the user wondering what specifically they're learning.
//
// Each goal is checked against the current message log; the check is a
// pure function so we can re-evaluate every render without bookkeeping.

import type { Emotion, EmotionProbs, Message } from "./types";

export type GoalType =
  | "anxiety_below" // 相手の不安を threshold 以下に
  | "joy_above" // 相手の喜びが threshold 以上に到達
  | "calm_above" // 相手の落ち着きが threshold 以上に到達
  | "user_question" // 自分から質問した（？か疑問詞を含む）
  | "user_echo" // 相手の言葉を一つ拾って返した（オウム返し）
  | "user_self_disclosure" // 自分のことを話した（「私」「自分」など）
  | "recovery_phrase" // 詰まったときの言葉を使った
  | "user_short_reply" // 短く返した（first user reply <= N chars）
  | "user_initiated"; // 自分から最初の一言を出した

export interface Goal {
  id: string;
  type: GoalType;
  label: string;
  // Threshold for emotion-type goals. For user_short_reply this is the
  // character cap. Ignored for goals that don't need a parameter.
  threshold?: number;
}

const QUESTION_RE = /[?？]|どう|どんな|なに|なん|どこ|いつ|だれ|なぜ/;
const SELF_DISCLOSURE_RE = /(私|自分|僕|俺|うち|わたし)/;
const RECOVERY_RE =
  /(うまく言え|考えて[まいた]|緊張して|分からなく|わからなく|もう一度|すみません)/;

// Tokenise a Japanese-ish string into 2-char windows. Crude, but enough to
// detect echoing — if any 2-char window from a previous character message
// appears in the user's reply, we count it as picked up. We strip very
// common particles/sentence-end words first so "ですね" / "でした" alone
// don't trip the check.
function makeWindows(text: string): string[] {
  const stripped = text
    .replace(/[、。！？!?…\.\s]/g, "")
    .replace(/(です|ます|ました|でした|ですね|だね|よね|から|ので|けど)/g, "");
  const windows: string[] = [];
  for (let i = 0; i < stripped.length - 1; i++) {
    windows.push(stripped.slice(i, i + 2));
  }
  return windows;
}

export function checkGoal(goal: Goal, messages: Message[]): boolean {
  switch (goal.type) {
    case "anxiety_below": {
      // Use the latest character emotion snapshot. We want a "currently
      // calmed" check, not "ever briefly dipped" — the partner can drift
      // back up and we shouldn't lock in a one-frame win.
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === "character" && m.emotion) {
          return m.emotion.anxiety <= (goal.threshold ?? 0.3);
        }
      }
      return false;
    }
    case "joy_above":
    case "calm_above": {
      const key: Emotion = goal.type === "joy_above" ? "joy" : "calm";
      // Best moment in the conversation — these are "you got there" goals,
      // not "stay there" ones, so the peak counts even if it dips later.
      let best = 0;
      for (const m of messages) {
        if (m.role === "character" && m.emotion) {
          best = Math.max(best, m.emotion[key]);
        }
      }
      return best >= (goal.threshold ?? 0.4);
    }
    case "user_question": {
      return messages.some(
        (m) => m.role === "user" && QUESTION_RE.test(m.text)
      );
    }
    case "user_echo": {
      // For each user message, check whether any 2-char window from the
      // immediately preceding character message appears in it.
      let prevChar: string | null = null;
      for (const m of messages) {
        if (m.role === "character") {
          prevChar = m.text;
          continue;
        }
        if (m.role === "user" && prevChar) {
          const windows = new Set(makeWindows(prevChar));
          for (let i = 0; i < m.text.length - 1; i++) {
            const w = m.text.slice(i, i + 2);
            if (windows.has(w)) return true;
          }
        }
      }
      return false;
    }
    case "user_self_disclosure": {
      return messages.some(
        (m) => m.role === "user" && SELF_DISCLOSURE_RE.test(m.text)
      );
    }
    case "recovery_phrase": {
      return messages.some(
        (m) => m.role === "user" && RECOVERY_RE.test(m.text)
      );
    }
    case "user_short_reply": {
      const cap = goal.threshold ?? 12;
      return messages.some(
        (m) => m.role === "user" && m.text.trim().length > 0 && m.text.length <= cap
      );
    }
    case "user_initiated": {
      // First non-opening message is the user's. The opening character
      // message has id "opening" by convention from page.tsx.
      const meaningful = messages.filter((m) => m.id !== "opening");
      return meaningful.length > 0 && meaningful[0].role === "user";
    }
  }
}

export function checkAllGoals(
  goals: Goal[],
  messages: Message[]
): { goal: Goal; done: boolean }[] {
  return goals.map((g) => ({ goal: g, done: checkGoal(g, messages) }));
}

// Expose the emotion delta detector here too — both the live "響いた"
// overlay and the "響いたセリフ" recorder need to find the largest swing
// between two snapshots, so we keep one canonical implementation.
export interface EmotionShift {
  emotion: Emotion;
  delta: number;
  // Positive means "the partner moved toward this emotion" — the user did
  // something that produced more of it. Negative is the inverse.
  sign: 1 | -1;
}

export function biggestShift(
  prev: EmotionProbs | undefined,
  curr: EmotionProbs
): EmotionShift | null {
  if (!prev) return null;
  let bestKey: Emotion = "joy";
  let bestVal = 0;
  for (const e of ["joy", "calm", "anxiety", "confusion"] as Emotion[]) {
    const d = curr[e] - prev[e];
    if (Math.abs(d) > Math.abs(bestVal)) {
      bestVal = d;
      bestKey = e;
    }
  }
  if (Math.abs(bestVal) < 0.08) return null;
  return {
    emotion: bestKey,
    delta: bestVal,
    sign: bestVal > 0 ? 1 : -1,
  };
}

// The user "landed" something good when joy or calm jumped, or when
// anxiety / confusion fell sharply. Used by the response overlay (A) and
// the effective-line recorder (D).
export function isPositiveLanding(shift: EmotionShift | null): boolean {
  if (!shift) return false;
  if (
    (shift.emotion === "joy" || shift.emotion === "calm") &&
    shift.sign > 0 &&
    shift.delta >= 0.1
  ) {
    return true;
  }
  if (
    (shift.emotion === "anxiety" || shift.emotion === "confusion") &&
    shift.sign < 0 &&
    shift.delta <= -0.1
  ) {
    return true;
  }
  return false;
}
