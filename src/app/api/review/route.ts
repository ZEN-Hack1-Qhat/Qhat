import { NextResponse } from "next/server";
import {
  reviewMock,
  reviewWithGemini,
  reviewWithGroq,
  type ReviewInput,
} from "@/lib/review";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";
import { CHARACTERS } from "@/lib/characters";
import { SCENES } from "@/lib/scenes";
import { STORY_EPISODES } from "@/lib/story";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 128 * 1024; // bigger than /api/turn — full transcript

interface RawReviewBody {
  episode_id?: unknown;
  goals_hit?: unknown;
  goals_missed?: unknown;
  messages?: unknown;
}

// Lightweight validation specific to /api/review. We don't reuse the
// /api/turn validator because the shape is different (no per-turn LLM
// inputs, but we need a full transcript). Keep it strict on lengths so
// a malicious caller can't make us send a giant prompt.
function validate(raw: unknown): ReviewInput | { error: string; status: number } {
  if (!raw || typeof raw !== "object") {
    return { error: "body must be JSON", status: 400 };
  }
  const b = raw as RawReviewBody;
  if (typeof b.episode_id !== "string") {
    return { error: "episode_id required", status: 400 };
  }
  const ep = STORY_EPISODES.find((e) => e.id === b.episode_id);
  if (!ep || ep.kind === "reflection" || !ep.sceneId) {
    return { error: "unknown episode", status: 400 };
  }
  // Find the character through the scene reference. We don't take the
  // characterId from the client because the server already knows which
  // character belongs to which episode.
  const scene = SCENES.find((s) => s.id === ep.sceneId);
  const sceneRefCharacter = scene?.characterId;
  if (!sceneRefCharacter || !CHARACTERS[sceneRefCharacter]) {
    return { error: "scene/character lookup failed", status: 500 };
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return { error: "messages required", status: 400 };
  }
  if (b.messages.length > 80) {
    return { error: "transcript too long", status: 400 };
  }
  // Be permissive on message shape — only require role + text. Other
  // fields (emotion, dominant) are optional and used by the heuristic
  // fallback when present.
  const messages = b.messages
    .filter(
      (m: unknown) =>
        m !== null &&
        typeof m === "object" &&
        typeof (m as { role?: unknown }).role === "string" &&
        typeof (m as { text?: unknown }).text === "string"
    )
    .map((m) => m as ReviewInput["messages"][number]);
  if (messages.length === 0) {
    return { error: "no valid messages", status: 400 };
  }

  const goalsHit = Array.isArray(b.goals_hit)
    ? (b.goals_hit as unknown[])
        .filter((s): s is string => typeof s === "string")
        .slice(0, 10)
        .map((s) => s.slice(0, 200))
    : [];
  const goalsMissed = Array.isArray(b.goals_missed)
    ? (b.goals_missed as unknown[])
        .filter((s): s is string => typeof s === "string")
        .slice(0, 10)
        .map((s) => s.slice(0, 200))
    : [];

  return {
    episodeId: ep.id,
    episodeDay: ep.day,
    episodeTitle: ep.title,
    learningGoal: ep.learningGoal,
    characterId: sceneRefCharacter,
    goalsHit,
    goalsMissed,
    messages,
  };
}

export async function POST(req: Request) {
  const limit = checkRateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString(),
        },
      }
    );
  }

  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload too large" }, { status: 413 });
    }
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const v = validate(raw);
  if ("error" in v) {
    return NextResponse.json({ error: v.error }, { status: v.status });
  }

  // Same cascade as /api/turn so the user gets the best provider available
  // but never gets stuck. Mock is grounded in the actual transcript so the
  // fallback isn't generic praise either.
  if (process.env.GEMINI_API_KEY) {
    try {
      const out = await reviewWithGemini(v);
      return NextResponse.json(out);
    } catch (e) {
      console.error("Gemini review error:", (e as Error).message);
    }
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const out = await reviewWithGroq(v);
      return NextResponse.json(out);
    } catch (e) {
      console.error("Groq review error:", (e as Error).message);
    }
  }
  return NextResponse.json(reviewMock(v));
}
