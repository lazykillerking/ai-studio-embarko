import crypto from 'crypto';
import type { Request, Response } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const DEVICE_COOKIE_NAME = 'bp_device_id';

/**
 * Escapes HTML special characters for safe server-side meta tag injection.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips ASCII control characters, collapses whitespace, removes angle brackets,
 * and caps length. Used for nicknames and crew names.
 */
export function sanitizeUserText(raw: string | undefined | null, maxLen: number): string {
  if (!raw) return '';
  // Strip C0/C1 control chars and zero-width characters
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLen);
}

export function isValidUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

/**
 * Resolves the anonymous device UUID from body/header/cookie.
 * Note: An anonymous client UUID stored in localStorage + a SameSite cookie
 * deters casual repeat voting and enables seamless reload resume without login,
 * but does not defend against determined adversaries who clear storage/cookies.
 */
export function resolveDeviceId(req: Request, res: Response, explicitDeviceId?: string): string {
  const headerId = typeof req.headers['x-device-id'] === 'string' ? req.headers['x-device-id'] : undefined;
  const cookies = parseCookies(req.headers.cookie);
  const cookieId = cookies[DEVICE_COOKIE_NAME];

  const candidate = [explicitDeviceId, headerId, cookieId].find((id) => isValidUuid(id));
  const deviceId = candidate ?? crypto.randomUUID();

  if (cookieId !== deviceId) {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie(DEVICE_COOKIE_NAME, deviceId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isHttps,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/',
    });
  }

  return deviceId;
}

export function getClientIp(req: Request): string {
  // Express 'trust proxy' populates req.ip from X-Forwarded-For cleanly
  return req.ip || req.socket.remoteAddress || 'unknown';
}

interface RateBucket {
  timestamps: number[];
}

/**
 * Lightweight in-memory sliding-window rate limiter (~60 answer mutations/min
 * per IP and per device). Suitable for a single-process Node server.
 */
export class AnswerRateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly buckets = new Map<string, RateBucket>();

  constructor(limit = 60, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const cutoff = now - this.windowMs;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }
    while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= cutoff) {
      bucket.timestamps.shift();
    }

    if (bucket.timestamps.length >= this.limit) {
      const oldest = bucket.timestamps[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    bucket.timestamps.push(now);

    // Periodic pruning to keep memory bounded under 256MB RAM limit
    if (this.buckets.size > 5000) {
      for (const [k, b] of this.buckets.entries()) {
        if (b.timestamps.length === 0 || b.timestamps[b.timestamps.length - 1] <= cutoff) {
          this.buckets.delete(k);
        }
      }
    }

    return { allowed: true, remaining: this.limit - bucket.timestamps.length, retryAfterSec: 0 };
  }

  checkPair(ip: string, deviceId: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const ipRes = this.check(`ip:${ip}`, now);
    if (!ipRes.allowed) return { allowed: false, retryAfterSec: ipRes.retryAfterSec };
    const devRes = this.check(`dev:${deviceId}`, now);
    if (!devRes.allowed) return { allowed: false, retryAfterSec: devRes.retryAfterSec };
    return { allowed: true, retryAfterSec: 0 };
  }
}
