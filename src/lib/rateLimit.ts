// Lightweight in-memory token-bucket-ish limiter. Per-instance only — fine for
// the demo (single Next.js process). Replace with Redis/upstash for production.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 10_000;
const MAX_REQUESTS = 30;
const MAX_KEYS = 10_000;

export function checkRateLimit(key: string): {
  ok: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) {
    // Drop oldest-expired entries to bound memory.
    for (const [k, b] of buckets) {
      if (b.resetAt < now) buckets.delete(k);
      if (buckets.size <= MAX_KEYS / 2) break;
    }
  }
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= MAX_REQUESTS) {
    return { ok: false, retryAfterMs: b.resetAt - now };
  }
  b.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function clientKey(req: Request): string {
  // Best-effort: prefer x-forwarded-for, fall back to a constant. Real IPs
  // require trusted proxy config; for HACK-1 demo this caps abuse from a
  // single misconfigured client.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anon";
}
