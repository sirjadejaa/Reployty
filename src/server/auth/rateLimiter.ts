/**
 * Reployty Distributed Rate Limiting Subsystem
 * 
 * Provides production-grade brute-force and abuse protection.
 * Backed by Redis with atomic Lua operations when configured (REDIS_URL).
 * Safely fails over to local in-memory sliding-window limiter if Redis is offline
 * or unconfigured, ensuring rate limiting is NEVER silently dropped.
 */

import crypto from 'crypto';
import Redis from 'ioredis';

export interface RateLimiterOptions {
  windowMs: number;       // Window duration in ms
  maxRequests: number;    // Allowed requests per window
  namespace?: string;     // Unique namespace to prevent key collisions
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface LocalEntry {
  count: number;
  resetAt: number;
}

// Global Redis client singleton
let redisClient: Redis | null = null;
let isRedisConnected = false;
let redisConnectionAttempted = false;

/**
 * Initializes or retrieves the global Redis client if REDIS_URL is configured.
 */
export function getRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisClient && !redisConnectionAttempted) {
    redisConnectionAttempted = true;
    try {
      redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        retryStrategy: (times) => {
          if (times > 3) return null; // stop retrying after 3 attempts
          return Math.min(times * 100, 1000);
        },
      });

      redisClient.on('connect', () => {
        isRedisConnected = true;
      });

      redisClient.on('error', () => {
        isRedisConnected = false;
      });

      redisClient.on('close', () => {
        isRedisConnected = false;
      });

      // Attempt async connection without blocking module initialization
      redisClient.connect().then(() => {
        isRedisConnected = true;
      }).catch(() => {
        isRedisConnected = false;
      });
    } catch {
      redisClient = null;
      isRedisConnected = false;
    }
  }

  return isRedisConnected ? redisClient : null;
}

/**
 * Lua script for atomic sliding/fixed window increment with TTL
 * KEYS[1]: rate limit key
 * ARGV[1]: window in ms
 * Returns: [current_count, pttl_ms]
 */
const ATOMIC_RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

export class RateLimiter {
  private localStore = new Map<string, LocalEntry>();
  public readonly windowMs: number;
  public readonly maxRequests: number;
  public readonly namespace: string;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.maxRequests = options.maxRequests;
    this.namespace = options.namespace || 'default';
  }

  /**
   * Generates an isolated, collision-safe Redis/Local key.
   * If the key contains potentially sensitive PII (e.g. emails), hashes the input.
   */
  private formatKey(rawKey: string): string {
    const sanitized = rawKey.includes('@')
      ? crypto.createHash('sha256').update(rawKey.toLowerCase().trim()).digest('hex').substring(0, 16)
      : rawKey.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return `reployty:rl:${this.namespace}:${sanitized}`;
  }

  /**
   * Synchronous consumption method.
   * Uses local in-memory store for instant zero-latency evaluation.
   * Ensures backward-compatibility with existing sync routes.
   */
  consume(key: string): RateLimitResult {
    const formattedKey = this.formatKey(key);
    const now = Date.now();
    const entry = this.localStore.get(formattedKey);

    if (!entry || now > entry.resetAt) {
      this.localStore.set(formattedKey, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        retryAfterSeconds: 0,
      };
    }

    if (entry.count >= this.maxRequests) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: retryAfterSeconds > 0 ? retryAfterSeconds : 1,
      };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Asynchronous consumption method with distributed Redis backing.
   * When Redis is available, executes atomic Lua increment in Redis.
   * Falls back to local in-memory consumption if Redis is unavailable.
   */
  async consumeAsync(key: string): Promise<RateLimitResult> {
    const redis = getRedisClient();
    if (!redis) {
      // Secure fallback to local in-memory rate limiting
      return this.consume(key);
    }

    const formattedKey = this.formatKey(key);
    try {
      const res = await redis.eval(
        ATOMIC_RATE_LIMIT_LUA,
        1,
        formattedKey,
        this.windowMs.toString()
      ) as [number, number];

      const count = Number(res[0]);
      const ttlMs = Number(res[1]);

      if (count > this.maxRequests) {
        const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, this.maxRequests - count),
        retryAfterSeconds: 0,
      };
    } catch {
      // On Redis network glitch or command error, fallback to local limiter immediately
      return this.consume(key);
    }
  }

  /**
   * Resets rate limit counters for a key in both local memory and Redis (if connected).
   */
  async reset(key: string): Promise<void> {
    const formattedKey = this.formatKey(key);
    this.localStore.delete(formattedKey);
    const redis = getRedisClient();
    if (redis) {
      try {
        await redis.del(formattedKey);
      } catch {
        // Silently proceed
      }
    }
  }
}

/**
 * Returns current status of the distributed rate limiter infrastructure.
 */
export function getRateLimiterStatus(): {
  backend: 'redis' | 'memory-fallback';
  redisConfigured: boolean;
  redisConnected: boolean;
} {
  const redisConfigured = Boolean(process.env.REDIS_URL);
  const client = getRedisClient();
  const redisConnected = Boolean(client && isRedisConnected);

  return {
    backend: redisConnected ? 'redis' : 'memory-fallback',
    redisConfigured,
    redisConnected,
  };
}

// ============================================================================
// Pre-configured Global Limiters
// ============================================================================

// 5 failed attempts per 15 minutes per IP/Account for Login
export const loginRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  namespace: 'login',
});

// 3 password reset requests per hour
export const passwordResetRateLimiter = new RateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  namespace: 'password_reset_request',
});

// 10 password reset verification attempts per 15 minutes
export const resetPasswordAttemptLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  namespace: 'password_reset_attempt',
});

// 20 AI review generation requests per minute
export const aiReviewGenerationLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  namespace: 'ai_review',
});

// 15 CSV export requests per minute
export const exportRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 15,
  namespace: 'csv_export',
});

// 60 webhook requests per minute
export const webhookRateLimiter = new RateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  namespace: 'webhook',
});

// 5 onboarding submissions per 15 minutes per IP
export const onboardingSubmissionLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  namespace: 'onboarding_submission',
});

// 10 invitation setup attempts per 15 minutes per IP
export const invitationAttemptLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  namespace: 'invitation_setup',
});

