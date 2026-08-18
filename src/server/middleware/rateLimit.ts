// Lightweight in-memory rate limiting.
//
// The roadmap calls for different limits per route group (auth, general
// api, server commands, file operations, node operations). There was no
// rate limiting at all before this. This is deliberately dependency-free
// (a sliding-window counter keyed by IP, using a plain Map) rather than
// pulling in express-rate-limit — it's a straightforward thing to
// implement correctly in ~60 lines, and it means this works immediately
// without needing `npm install` + network access to fetch a new package.
//
// Caveat: this is per-process, in-memory state. It's a correct and
// useful limiter for the single-instance deployment this panel is today.
// Once the panel runs multiple Panel API instances behind a load
// balancer (the P1 "separate Panel API and Node Agent" architecture),
// this should move to a shared Redis-backed store so limits are
// enforced across instances rather than per-instance — swapping to
// express-rate-limit + rate-limit-redis at that point is a natural
// upgrade and shouldn't require touching the call sites below.

import { Request, Response, NextFunction } from "express";

interface Bucket {
  hits: number[]; // timestamps (ms) of requests within the current window
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so IPs that stop making requests don't sit in memory
// forever. Runs independently of any single limiter's window.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - SWEEP_INTERVAL_MS;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.length === 0 || bucket.hits[bucket.hits.length - 1] < cutoff) {
      buckets.delete(key);
    }
  }
}, SWEEP_INTERVAL_MS).unref();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Prefix so the same client gets independent buckets per route group. */
  name: string;
  message?: string;
}

function keyFor(req: Request, name: string): string {
  const user = (req as any).user;
  // Authenticated requests are limited per-user (so one user's API key
  // can't be starved by another user sharing a NAT'd IP); anonymous
  // requests (login, register) are limited per-IP.
  const identity = user?.id ? `u:${user.id}` : `ip:${req.ip}`;
  return `${name}|${identity}`;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, name } = options;
  const message = options.message || "Too many requests, please slow down.";

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const key = keyFor(req, name);
    const now = Date.now();
    const windowStart = now - windowMs;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      buckets.set(key, bucket);
    }

    // Drop hits outside the current window.
    while (bucket.hits.length > 0 && bucket.hits[0] < windowStart) {
      bucket.hits.shift();
    }

    if (bucket.hits.length >= max) {
      const retryAfterMs = bucket.hits[0] + windowMs - now;
      res.setHeader("Retry-After", Math.ceil(retryAfterMs / 1000).toString());
      res.status(429).json({ error: message });
      return;
    }

    bucket.hits.push(now);
    next();
  };
}

// Route-group presets matching the roadmap's grouping:
//   /auth/*        strict — brute-force login/register protection
//   /api/* general moderate — general API traffic
//   /servers/*/command  moderate — console spam protection
//   /files/*       moderate — upload/download abuse protection
//   /nodes/*       moderate — node management traffic
export const authRateLimit = createRateLimiter({
  name: "auth",
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many auth requests. Please wait a minute and try again.",
});

export const generalApiRateLimit = createRateLimiter({
  name: "api",
  windowMs: 60 * 1000,
  max: 300,
});

export const commandRateLimit = createRateLimiter({
  name: "command",
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many console commands sent. Please slow down.",
});

export const fileOpsRateLimit = createRateLimiter({
  name: "files",
  windowMs: 60 * 1000,
  max: 180,
});

export const nodeOpsRateLimit = createRateLimiter({
  name: "nodes",
  windowMs: 60 * 1000,
  max: 120,
});
