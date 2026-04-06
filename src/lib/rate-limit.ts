type RateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * IP-based rate limiter with periodic eviction of stale entries.
 * Note: on serverless platforms each isolate maintains its own map, so this
 * is best-effort — it stops bursts within the same warm instance but cannot
 * guarantee global limits across all concurrent isolates.
 */
const buckets = new Map<string, RateLimitEntry>();
const MAX_BUCKETS = 10_000;
let lastEviction = Date.now();
const EVICTION_INTERVAL_MS = 60_000;

function evictStale() {
  const now = Date.now();
  if (now - lastEviction < EVICTION_INTERVAL_MS) return;
  lastEviction = now;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
  // Safety cap: if still too large, drop oldest half
  if (buckets.size > MAX_BUCKETS) {
    const keysToDelete = Array.from(buckets.keys()).slice(0, Math.floor(buckets.size / 2));
    for (const key of keysToDelete) {
      buckets.delete(key);
    }
  }
}

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(request: Request, options: { key: string; limit: number; windowMs: number }) {
  evictStale();
  const now = Date.now();
  const ip = getClientIp(request);
  const bucketKey = `${options.key}:${ip}`;
  const existing = buckets.get(bucketKey);

  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
    return { ok: true, remaining: options.limit - 1, resetAt: now + options.windowMs };
  }

  if (existing.count >= options.limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  buckets.set(bucketKey, existing);
  return { ok: true, remaining: options.limit - existing.count, resetAt: existing.resetAt };
}
