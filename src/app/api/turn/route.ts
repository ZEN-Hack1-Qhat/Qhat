import { NextResponse } from "next/server";
import { runMockTurn } from "@/lib/mockInference";
import { isGeminiConfigured, NoLLMKeyError, runGeminiTurn } from "@/lib/llm";
import { validateTurnRequest, ValidationError } from "@/lib/validate";
import { checkRateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
// Gemini calls can take a couple of seconds; let Vercel give us headroom.
export const maxDuration = 30;

const MAX_BODY_BYTES = 64 * 1024;

export async function GET() {
  // Lightweight status probe so the client can show a Mock/LLM badge.
  return NextResponse.json({
    mode: isGeminiConfigured() ? "gemini" : "mock",
  });
}

export async function POST(req: Request) {
  const limit = checkRateLimit(clientKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString() },
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

  let parsed;
  try {
    parsed = validateTurnRequest(raw);
  } catch (e) {
    const message = e instanceof ValidationError ? e.message : "invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Try Gemini first; fall back to mock if no key or anything goes wrong.
  if (isGeminiConfigured()) {
    try {
      const out = await runGeminiTurn(parsed);
      return NextResponse.json({ ...out, mode: "gemini" });
    } catch (e) {
      if (!(e instanceof NoLLMKeyError)) {
        // Log to server for debugging; don't surface to client.
        console.error("Gemini error, falling back to mock:", (e as Error).message);
      }
    }
  }

  let result;
  try {
    result = runMockTurn(parsed);
  } catch {
    return NextResponse.json({ error: "inference failed" }, { status: 500 });
  }
  return NextResponse.json({ ...result, mode: "mock" });
}
