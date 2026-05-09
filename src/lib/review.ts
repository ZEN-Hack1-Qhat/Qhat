// End-of-episode review generation. Single-shot — the API takes a finished
// transcript + episode metadata and returns a short feedback object that
// the practitioner reads once before going back to the timeline.
//
// The shape is intentionally tight (one quote, one tip, one verdict). The
// 卒業 ethos doesn't want a graded report — we want a recognition moment
// that points back at the actual conversation, then sends them on.

import type { Message } from "./types";
import { CHARACTERS } from "./characters";

export interface ReviewResult {
  goodPoint: { quote: string; reason: string };
  nextStep: string;
  verdict: string;
  // Which provider produced this — used by the UI to show a small mode tag
  // and by tests to assert the cascade path.
  mode: "gemini" | "groq" | "mock";
}

export interface ReviewInput {
  episodeId: string;
  episodeDay: number;
  episodeTitle: string;
  learningGoal: string;
  characterId: string;
  // Goal labels the user satisfied this session — surfaced to the LLM so
  // it can ground its praise instead of inventing strengths from nothing.
  goalsHit: string[];
  // Goal labels the user didn't satisfy — used to suggest a concrete
  // next step rather than generic encouragement.
  goalsMissed: string[];
  messages: Message[];
}

const PROMPT_TEMPLATE = (input: ReviewInput): string => {
  const c = CHARACTERS[input.characterId];
  const transcript = input.messages
    .filter((m) => m.id !== "opening" || m.role === "character")
    .map((m) => {
      if (m.role === "user") return `練習者: ${m.text}`;
      const speaker = m.speaker
        ? CHARACTERS[m.speaker]?.name ?? "相手"
        : "相手";
      return `${speaker}: ${m.text}`;
    })
    .join("\n");

  return `あなたは対人不安を抱える人の会話練習をサポートするコーチです。今回1エピソード分の会話が終わりました。練習者を励まし、次に進める短いフィードバックを返してください。

# シーン
Day ${input.episodeDay}: ${input.episodeTitle}
今回の学習目標: ${input.learningGoal}
相手: ${c?.name ?? input.characterId}（${c?.age ?? "?"}歳）

# 会話の記録
${transcript}

# 達成された目標
${input.goalsHit.length > 0 ? input.goalsHit.map((g) => `- ${g}`).join("\n") : "（自動判定された達成項目なし）"}

# 未達成の目標
${input.goalsMissed.length > 0 ? input.goalsMissed.map((g) => `- ${g}`).join("\n") : "（なし）"}

# 出力フォーマット（JSONのみ、コードブロック・前置き禁止）
{
  "goodPoint": {
    "quote": "練習者の発言から1つだけ短く引用（25文字以内、原文ママ）",
    "reason": "なぜその発言が効いたか、1文・30文字以内"
  },
  "nextStep": "次に試すといいこと、具体的に1文・40文字以内",
  "verdict": "本番に向けた短い一言・30文字以内"
}

書き方の決まり:
- 練習者を批判しない。できたことを認める。
- 抽象的な励ましは避ける。引用は実際の発言から。
- 「もっと頑張ろう」「次はもっと〜」など漠然とした言い方禁止。
- 「会話量が少なすぎる」のような結果論ではなく、次のターンで使える具体的な手を示す。
- verdict は「本番でも〜」で締める方向だが、機械的に同じ文言は避ける。`;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    goodPoint: {
      type: "object",
      properties: {
        quote: { type: "string" },
        reason: { type: "string" },
      },
      required: ["quote", "reason"],
    },
    nextStep: { type: "string" },
    verdict: { type: "string" },
  },
  required: ["goodPoint", "nextStep", "verdict"],
};

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export async function reviewWithGemini(
  input: ReviewInput
): Promise<ReviewResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("no key");

  const body = {
    contents: [{ role: "user", parts: [{ text: PROMPT_TEMPLATE(input) }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const data = await res.json();
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("empty review response");
  const parsed = JSON.parse(text);
  return shape(parsed, "gemini");
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

export async function reviewWithGroq(input: ReviewInput): Promise<ReviewResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("no key");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: PROMPT_TEMPLATE(input) }],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty review response");
  const parsed = JSON.parse(text);
  return shape(parsed, "groq");
}

function shape(raw: unknown, mode: "gemini" | "groq"): ReviewResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const gp = (o.goodPoint ?? {}) as Record<string, unknown>;
  return {
    goodPoint: {
      quote: typeof gp.quote === "string" ? gp.quote.trim().slice(0, 80) : "",
      reason: typeof gp.reason === "string" ? gp.reason.trim().slice(0, 120) : "",
    },
    nextStep:
      typeof o.nextStep === "string" ? o.nextStep.trim().slice(0, 160) : "",
    verdict:
      typeof o.verdict === "string" ? o.verdict.trim().slice(0, 120) : "",
    mode,
  };
}

// Heuristic fallback for when neither LLM is reachable. Builds the review
// from data we already have (effective lines, missed goals) so it's still
// grounded in the user's actual conversation rather than generic praise.
export function reviewMock(input: ReviewInput): ReviewResult {
  // Pick the user line preceding the largest positive emotion shift in
  // the transcript. That's the closest we can get to "this is what
  // worked" without an LLM judging it.
  let bestQuote = "";
  let bestEmotion: "joy" | "calm" | "anxiety" | "confusion" = "joy";
  let bestDelta = 0;
  let prevUserText = "";
  let prevCharEmotion: Record<string, number> | undefined;
  for (const m of input.messages) {
    if (m.role === "user") {
      prevUserText = m.text;
      continue;
    }
    if (m.role === "character" && m.emotion) {
      if (prevCharEmotion && prevUserText) {
        for (const e of ["joy", "calm", "anxiety", "confusion"] as const) {
          const d = m.emotion[e] - (prevCharEmotion[e] ?? 0);
          const positive =
            (e === "joy" || e === "calm") && d > 0
              ? d
              : (e === "anxiety" || e === "confusion") && d < 0
              ? -d
              : 0;
          if (positive > bestDelta) {
            bestDelta = positive;
            bestQuote = prevUserText;
            bestEmotion = e;
          }
        }
      }
      prevCharEmotion = m.emotion as unknown as Record<string, number>;
    }
  }

  const reasonByEmotion: Record<string, string> = {
    joy: "相手の喜びを引き出せた",
    calm: "相手が落ち着いてくれた",
    anxiety: "相手の緊張をほぐせた",
    confusion: "意図が伝わった",
  };

  const goodPoint = bestQuote
    ? {
        quote: bestQuote.slice(0, 30),
        reason: reasonByEmotion[bestEmotion],
      }
    : {
        quote: "",
        reason: "短くてもしっかり一往復できていた",
      };

  const nextStep =
    input.goalsMissed.length > 0
      ? `次は「${input.goalsMissed[0]}」を一度だけ意識してみる`
      : "今と同じ感じで、本番でもそのまま大丈夫";

  const verdict =
    input.goalsHit.length >= 2
      ? "本番でも、もう十分やれます"
      : input.goalsHit.length >= 1
      ? "あと一歩、本番でも通用します"
      : "今日できた1往復が本番の素地になります";

  return { goodPoint, nextStep, verdict, mode: "mock" };
}
