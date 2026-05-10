// Groq fallback (Llama 3.3 70B). Same TurnResponse shape as runGeminiTurn so
// /api/turn can swap it in when Gemini is rate-limited.
//
// Reads GROQ_API_KEY from env. Free tier on Groq is generous and doesn't
// require a credit card, so this is the cheapest safety net we can offer.

import type { Message, TurnResponse } from "./types";
import { CHARACTERS } from "./characters";
import { dominant, entropy } from "./emotion";
import { buildSystemPrompt, clampProbs, type LLMInput } from "./llm";

export class NoGroqKeyError extends Error {}
export class GroqCallError extends Error {}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Llama 3.3 70B is Groq's flagship for general chat and the strongest at
// Japanese among their lineup. Other options are llama-3.1-8b-instant
// (faster but weaker) and mixtral-8x7b-32768.
const GROQ_MODEL = "llama-3.3-70b-versatile";

// JSON-mode hint that we append to the system prompt. Llama doesn't accept
// a separate JSON schema, so we describe the contract here and rely on
// response_format: { type: "json_object" } to keep it well-formed.
const JSON_INSTRUCTION = `
# 出力フォーマット（厳守）
必ず以下のJSONオブジェクト1つだけを返してください。前置き・コードブロック・追加コメント禁止。
{
  "reply": "1〜2文の日本語の応答",
  "emotion": { "joy": 0.0〜1.0, "calm": 0.0〜1.0, "anxiety": 0.0〜1.0, "confusion": 0.0〜1.0 },
  "reaction": "心の中のひとこと（6〜12文字）",
  "reception": "練習者の発話がどう届いたか、第三者目線で12〜25文字",
  "keyFacts": ["新しく判明した事実があれば1〜3個", ...],
  "goalsHit": ["ユーザーが今回の発話で達成した練習目標id（あれば）"]
}
emotion の4つの数値の合計は 1.0 になるようにしてください。
goalsHit はシステムプロンプトで列挙された目標idのみ使用。判定対象は直近のユーザー発話だけ、達成がなければ空配列。`;

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function buildMessages(input: LLMInput, characterName: string): GroqMessage[] {
  // Build the system prompt, optionally appending the goal-judgment block
  // so Llama knows what ids it can return in goalsHit. Mirrors the Gemini
  // path so behaviour stays consistent across providers.
  let systemPrompt = buildSystemPrompt(input.characterId, input.sceneId);
  if (input.goalsToJudge && input.goalsToJudge.length > 0) {
    systemPrompt += `

# 目標達成判定（重要）
ユーザーの **直近の発話だけ** を対象に、以下の練習目標が達成されたか判定してください。意味的に拾えていれば言い換えでもOK。
${input.goalsToJudge.map((g) => `- ${g.id}: ${g.label}`).join("\n")}
達成された目標の id だけを goalsHit 配列に入れて返してください。なにも当てはまらなければ空配列。`;
  }

  const messages: GroqMessage[] = [
    {
      role: "system",
      content: systemPrompt + JSON_INSTRUCTION,
    },
  ];

  if (input.keyFacts && input.keyFacts.length > 0) {
    messages.push({
      role: "system",
      content:
        "（メモ：これまでの会話で判明した事実 — " +
        input.keyFacts.slice(-15).join(" / ") +
        "）",
    });
  }

  for (const m of input.history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.text });
    } else if (m.role === "character") {
      messages.push({ role: "assistant", content: m.text });
    }
  }

  // OpenAI-compatible chat APIs prefer the conversation to start with a user
  // turn after system. If our log starts with the assistant opening, prepend
  // a placeholder.
  const firstNonSystem = messages.find((m) => m.role !== "system");
  if (!firstNonSystem || firstNonSystem.role !== "user") {
    // Insert at index 1 (just after the main system prompt).
    messages.splice(1, 0, {
      role: "user",
      content: `（ここから会話を始めます。${characterName} から自然に話しかけてください。）`,
    });
  }

  let lastUserText: string;
  if (input.proactive) {
    lastUserText =
      "（練習者は黙っている。間が空いている。あなた側から自然に話しかけてください。）";
  } else if (input.expand) {
    lastUserText =
      "（練習者の返事が短かった。あなたから話題を広げる質問を1つしてください。）";
  } else {
    lastUserText = input.userText;
  }
  messages.push({ role: "user", content: lastUserText });

  return messages;
}

export async function runGroqTurn(input: LLMInput): Promise<TurnResponse> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new NoGroqKeyError("GROQ_API_KEY not set");

  const c = CHARACTERS[input.characterId];
  if (!c) throw new GroqCallError(`unknown character_id: ${input.characterId}`);

  const messages = buildMessages(input, c.name);

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: 0.85,
        top_p: 0.95,
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    throw new GroqCallError(`network: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new GroqCallError(`groq ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const llmMs = performance.now() - start;

  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new GroqCallError("empty response from Groq");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GroqCallError("Groq returned non-JSON despite response_format");
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const reply =
    typeof obj.reply === "string" && obj.reply.trim()
      ? obj.reply.trim()
      : "";
  if (!reply) throw new GroqCallError("Groq returned empty reply");

  const emo = clampProbs(obj.emotion);
  const dom = dominant(emo);
  const reaction =
    typeof obj.reaction === "string" && obj.reaction.trim()
      ? obj.reaction.trim()
      : c.bubbles[dom][0];
  const reception =
    typeof obj.reception === "string" && obj.reception.trim()
      ? obj.reception.trim()
      : undefined;
  const keyFactsLearned = Array.isArray(obj.keyFacts)
    ? (obj.keyFacts as unknown[])
        .filter((s) => typeof s === "string" && (s as string).trim().length > 0)
        .map((s) => (s as string).trim().slice(0, 80))
        .slice(0, 5)
    : [];

  const askedIds = new Set((input.goalsToJudge ?? []).map((g) => g.id));
  const goalsHit = Array.isArray(obj.goalsHit)
    ? (obj.goalsHit as unknown[])
        .filter((x): x is string => typeof x === "string" && askedIds.has(x))
        .slice(0, 6)
    : [];

  const characterMessage: Message = {
    id: `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    role: "character",
    speaker: c.id,
    text: reply,
    timestamp: Date.now(),
    emotion: emo,
    dominant: dom,
    reactionBubble: reaction,
    receptionSummary: reception,
    proactive: input.proactive,
    expanded: input.expand,
    redoCount: input.redoCount,
  };

  return {
    characterMessage,
    keyFactsLearned,
    goalsHit,
    inferenceMeta: {
      quantumInferenceMs: 0,
      llmInferenceMs: +llmMs.toFixed(1),
      dominantEmotion: dom,
      entropyBits: +entropy(emo).toFixed(3),
      emotionDelta: {
        joy: +(emo.joy - input.prevEmotion.joy).toFixed(3),
        calm: +(emo.calm - input.prevEmotion.calm).toFixed(3),
        anxiety: +(emo.anxiety - input.prevEmotion.anxiety).toFixed(3),
        confusion: +(emo.confusion - input.prevEmotion.confusion).toFixed(3),
      },
    },
  };
}
