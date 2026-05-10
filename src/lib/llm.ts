// Gemini 2.5 Flash integration. Returns the same shape as runMockTurn so the
// /api/turn route can swap implementations transparently.
//
// Reads GEMINI_API_KEY from env. If missing, the helpers throw a typed error
// so the route can fall back to the mock without leaking 500s.

import type {
  Emotion,
  EmotionProbs,
  Message,
  TurnResponse,
} from "./types";
import { CHARACTERS } from "./characters";
import { dominant, entropy, normalize } from "./emotion";
import { SCENES } from "./scenes";

export class NoLLMKeyError extends Error {}
export class LLMCallError extends Error {}

// Gemini 3 Flash Preview — frontier-class generation at Flash latency.
// Override via GEMINI_MODEL env if a newer/different model becomes
// available (e.g. gemini-3.1-flash-preview when it gets exposed for this
// account). Falls back to 2.5-flash-style behaviour automatically since
// the request shape is identical.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "Natural Japanese reply, in character. 1-2 sentences max. Should sound spoken, not written.",
    },
    emotion: {
      type: "object",
      properties: {
        joy: { type: "number" },
        calm: { type: "number" },
        anxiety: { type: "number" },
        confusion: { type: "number" },
      },
      required: ["joy", "calm", "anxiety", "confusion"],
    },
    reaction: {
      type: "string",
      description:
        "Inner-thought bubble shown above the character's head. Very short Japanese phrase, 6-12 chars.",
    },
    reception: {
      type: "string",
      description:
        "How the user's last message landed, written from a third-person observer's perspective. 12-25 Japanese chars.",
    },
    keyFacts: {
      type: "array",
      items: { type: "string" },
      description:
        "New facts revealed in this exact turn that should be remembered for the rest of the conversation. E.g. 'ユーザーは関西出身', 'ユーザーは映画好き'. Empty array if nothing new.",
    },
    goalsHit: {
      type: "array",
      items: { type: "string" },
      description:
        "IDs of practice goals the user satisfied with their LATEST message (not earlier in the conversation). Judge semantically — 'echo' counts even if the user paraphrased; 'self-disclosure' counts for any first-person sharing. Empty array if none hit. The set of goals to judge is provided in the system prompt.",
    },
  },
  required: ["reply", "emotion", "reaction", "reception"],
};

export interface LLMInput {
  userText: string;
  prevEmotion: EmotionProbs;
  characterId: string;
  redoCount: number;
  proactive?: boolean;
  expand?: boolean;
  history: Message[];
  sceneId: string;
  // Facts the model has accumulated about the practitioner so far this session.
  keyFacts?: string[];
  // Practice goals to evaluate against the user's latest message. Surface
  // only semantic goals here — emotion/length goals are checked client-side.
  goalsToJudge?: { id: string; label: string }[];
}

export function buildSystemPrompt(characterId: string, sceneId: string): string {
  const c = CHARACTERS[characterId];
  const scene = SCENES.find((s) => s.id === sceneId);
  const p = c.profile;

  const registerLine: Record<typeof p.register, string> = {
    formal: "敬語ベース。一人称は「私」。",
    casual: "カジュアル・タメ口寄り。",
    mixed: "敬語と砕けた口調が混ざる。年齢が近い相手には「〜ですよね」「〜なんです」も使う。",
  };

  return `あなたは「${c.name}」（${c.age}歳）として、日本語で会話します。

# 人物像
${p.personality}

# 話し方
${registerLine[p.register]}

# 関係性
${p.relationship}

# シーン
タイトル: ${scene?.title ?? ""}
状況: ${scene?.description ?? ""}
社会的圧力: ${scene?.socialPressure ?? ""}

# この人物に「響く」言葉のパターン
${p.whatLandsWell.map((s, i) => `${i + 1}. ${s}`).join("\n")}

# この人物に「届かない／違和感が出る」パターン
${p.whatLandsBadly.map((s, i) => `${i + 1}. ${s}`).join("\n")}

# 感情のトリガー
- 嬉しさを引き出す話題: ${p.triggers.joy.join("、")}
- 不安を強める要因: ${p.triggers.anxiety.join("、")}

# あなたの役割
- 上の人物として、対人不安を抱える練習者と会話する。
- 1ターンの応答は1〜2文。話しすぎない。短くテンポよく。
- **これまでの会話の流れを必ず踏まえる**。同じ話題を繰り返したり、すでに触れた内容を聞き直したりしない。前のターンで出た固有名詞・キーワードは、自然に拾って活かす。
- 練習者の言葉を **オウム返ししすぎない**。自然に受けて、返す。
- ユーザーが上記「響くパターン」をしてきたら不安が下がり、嬉しさ・落ち着きが上がる。「届かないパターン」だと戸惑い・不安が上がる。**この対応関係を必ず感情確率に反映する**。
- 相手が短い返事や沈黙でも、自然な間でこちらから話を広げて構わない。

# 出力（必ずJSONで返す。コードブロックも前置きも不要）
- reply: 上の人物としての応答（短い日本語、1〜2文）
- emotion: 応答時点の人物の感情確率。{ joy, calm, anxiety, confusion } の合計を 1.0 にする。会話の流れと「響き／届かない」パターンを反映させる。
- reaction: 心の中のひとこと（頭上の吹き出しに出る、6〜12文字程度の日本語）。例: 「嬉しい！」「えっ、よそよそしい…」「テンポ悪いな…」
- reception: 練習者の今の発話が **この人物にどう届いたか** を第三者目線で1文（12〜25文字）。シーン・人物プロファイルを踏まえること。例: 咲良に対して『そうですね』だけだと「興味なさそうに聞こえたかも」、田中先輩に対しては「結論ファーストで好印象」など。`;
}

function buildHistoryContents(
  history: Message[],
  characterName: string
): Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> {
  // Translate our message log into Gemini's contents shape. The character is
  // the "model" side; the practitioner is the "user" side.
  const out: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of history) {
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.text }] });
    } else if (m.role === "character") {
      out.push({ role: "model", parts: [{ text: m.text }] });
    }
  }
  // Gemini requires the FIRST item to be from the user. If our log starts
  // with the character's opening line, prepend a placeholder user turn.
  if (out.length === 0 || out[0].role !== "user") {
    out.unshift({
      role: "user",
      parts: [
        {
          text: `（ここから会話を始めます。${characterName} から自然に話しかけてください。）`,
        },
      ],
    });
  }
  return out;
}

export function clampProbs(raw: unknown): EmotionProbs {
  const fallback: EmotionProbs = {
    joy: 0.25,
    calm: 0.25,
    anxiety: 0.25,
    confusion: 0.25,
  };
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof EmotionProbs): number => {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return 0.25;
    return Math.max(0.01, Math.min(1, v));
  };
  return normalize({
    joy: num("joy"),
    calm: num("calm"),
    anxiety: num("anxiety"),
    confusion: num("confusion"),
  });
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function runGeminiTurn(input: LLMInput): Promise<TurnResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new NoLLMKeyError("GEMINI_API_KEY not set");

  const c = CHARACTERS[input.characterId];
  if (!c) throw new LLMCallError(`unknown character_id: ${input.characterId}`);

  let systemPrompt = buildSystemPrompt(input.characterId, input.sceneId);
  // Append goal-judgment instructions only when the caller provides goals.
  // Keeping this out of the role-play prompt by default avoids drowning
  // the persona in evaluator-mode language during normal turns.
  if (input.goalsToJudge && input.goalsToJudge.length > 0) {
    systemPrompt += `

# 目標達成判定（重要）
通常のロールプレイ応答に加えて、ユーザーの **直近の発話** だけを対象に、以下の練習目標が達成されたか判定してください。意味的に拾えていれば言い換えでもOK（例: "映画" を "シネマ" と返したら echo は達成）。
${input.goalsToJudge.map((g) => `- ${g.id}: ${g.label}`).join("\n")}
達成された目標の id だけを goalsHit 配列に入れて返してください。判定は今回のユーザー発話のみが対象で、過去ターンは無視。なにも当てはまらなければ空配列。`;
  }

  const history = buildHistoryContents(input.history, c.name);

  // Inject accumulated facts as the very first model turn. This is more
  // reliable than appending to the system prompt because the model treats
  // the recent context with higher attention.
  if (input.keyFacts && input.keyFacts.length > 0) {
    history.unshift({
      role: "user",
      parts: [
        {
          text:
            "（メモ：これまでの会話で判明した事実 — " +
            input.keyFacts.slice(-15).join(" / ") +
            ")",
        },
      ],
    });
  }

  // Append the practitioner's latest line, augmented with state hints. For
  // proactive/expand cases we synthesise a directive instead.
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
  history.push({ role: "user", parts: [{ text: lastUserText }] });

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: history,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
    },
  };

  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new LLMCallError(`network: ${(e as Error).message}`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new LLMCallError(`gemini ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const llmMs = performance.now() - start;

  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new LLMCallError("empty response from Gemini");

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LLMCallError("Gemini returned non-JSON despite responseSchema");
  }

  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) throw new LLMCallError("Gemini returned empty reply");

  const emo = clampProbs(parsed.emotion);
  const dom = dominant(emo);
  const reaction =
    typeof parsed.reaction === "string" && parsed.reaction.trim()
      ? parsed.reaction.trim()
      : c.bubbles[dom][0];
  const reception =
    typeof parsed.reception === "string" && parsed.reception.trim()
      ? parsed.reception.trim()
      : undefined;
  const keyFactsLearned = Array.isArray(parsed.keyFacts)
    ? (parsed.keyFacts as unknown[])
        .filter((s) => typeof s === "string" && s.trim().length > 0)
        .map((s) => (s as string).trim().slice(0, 80))
        .slice(0, 5)
    : [];

  // Filter goalsHit to ids the caller actually asked about — defends
  // against the model hallucinating goal ids that don't exist client-side.
  const askedIds = new Set((input.goalsToJudge ?? []).map((g) => g.id));
  const goalsHit = Array.isArray(parsed.goalsHit)
    ? (parsed.goalsHit as unknown[])
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
      // We're not running the quantum circuit yet — surface the LLM time
      // under the slot we have and leave quantumInferenceMs as a placeholder.
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
