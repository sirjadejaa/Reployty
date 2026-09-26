/**
 * REPLOYTY PHASE 18: PRODUCTION HARDENING & OPERATIONAL READINESS TEST SUITE
 * 
 * Verifies:
 * 1. Centralized Environment Validation (fail-fast, production rules, secret protection)
 * 2. Health & Readiness Probes (/health and /ready)
 * 3. Distributed Rate Limiter (concurrency, key isolation, fail-safe fallback, status)
 * 4. Request Correlation Tracking (X-Request-Id injection & propagation)
 * 5. Production Security Headers & CORS Enforcement
 * 6. Background Worker Manager & Overlap Protection
 * 7. Error Monitoring Sanitization (zero credentials logged or dispatched)
 */

import test from 'node:test';
import assert from 'node:assert';
import { startTestServer, apiRequest, TestServerContext } from '../e2e/test_helpers';
import { validateEnv, ConfigurationError } from '../../src/server/config/env';
import { RateLimiter, getRateLimiterStatus } from '../../src/server/auth/rateLimiter';
import { workerManager } from '../../src/server/jobs/workerManager';
import { sanitizeLogMetadata } from '../../src/server/utils/logger';

test('REPLOYTY PRODUCTION HARDENING & OPERATIONAL OPERATIONS (PHASE 18)', async (t) => {
  let serverCtx: TestServerContext;

  t.before(async () => {
    serverCtx = await startTestServer();
  });

  t.after(async () => {
    if (serverCtx) {
      await serverCtx.stop();
    }
  });

  // =========================================================================
  // 1. Centralized Environment Validation Layer
  // =========================================================================
  await t.test('Env: Fails fast on missing or invalid database URL', () => {
    assert.throws(
      () => validateEnv({ NODE_ENV: 'development', DATABASE_URL: '' }),
      (err: any) => err instanceof ConfigurationError && err.missingKeys.includes('DATABASE_URL'),
      'Throws ConfigurationError when DATABASE_URL is missing'
    );

    assert.throws(
      () => validateEnv({ NODE_ENV: 'development', DATABASE_URL: 'mysql://invalid:3306/db' }),
      (err: any) => err instanceof ConfigurationError && err.message.includes('valid PostgreSQL connection string'),
      'Throws ConfigurationError on invalid DB connection protocol'
    );
  });

  await t.test('Env: Production rules strictly enforced without leaking secrets', () => {
    // Missing APP_URL in production
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://user:secretpass@db.internal:5432/reployty',
        }),
      (err: any) => {
        assert.ok(err instanceof ConfigurationError);
        assert.ok(err.missingKeys.includes('APP_URL'));
        // Verify secret pass is NOT in error message
        assert.ok(!err.message.includes('secretpass'), 'Secret password must not leak in error message');
        return true;
      }
    );

    // Insecure HTTP APP_URL in production
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://localhost:5432/reployty',
          APP_URL: 'http://insecure-domain.com',
          ALLOWED_ORIGINS: 'https://app.reployty.com',
          BILLING_WEBHOOK_SECRET: 'whsec_test',
        }),
      (err: any) => err instanceof ConfigurationError && err.message.includes('must use HTTPS')
    );

    // Wildcard CORS disallowed in production
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://localhost:5432/reployty',
          APP_URL: 'https://app.reployty.com',
          ALLOWED_ORIGINS: '*',
          BILLING_WEBHOOK_SECRET: 'whsec_test',
        }),
      (err: any) => err instanceof ConfigurationError && err.message.includes('cannot contain wildcard "*"')
    );

    // Localhost CORS disallowed in production
    assert.throws(
      () =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://localhost:5432/reployty',
          APP_URL: 'https://app.reployty.com',
          ALLOWED_ORIGINS: 'http://localhost:3000',
          BILLING_WEBHOOK_SECRET: 'whsec_test',
        }),
      (err: any) => err instanceof ConfigurationError && err.message.includes('cannot contain local development origins')
    );
  });

  // =========================================================================
  // 2. Health & Readiness Probes
  // =========================================================================
  await t.test('Probes: GET /api/health returns liveness status without internal secrets', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'healthy');
    assert.ok(typeof res.body.uptimeSeconds === 'number', 'Uptime reported');
    assert.ok(res.body.timestamp, 'Timestamp present');
    assert.strictEqual(res.body.DATABASE_URL, undefined, 'DATABASE_URL not exposed');
    assert.strictEqual(res.body.SESSION_SECRET, undefined, 'SESSION_SECRET not exposed');
  });

  await t.test('Probes: GET /api/ready verifies database & rate limiter connectivity', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/ready');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ready');
    assert.strictEqual(res.body.database.status, 'healthy');
    assert.ok(typeof res.body.database.latencyMs === 'number', 'DB Latency reported');
    assert.ok(['redis', 'memory-fallback'].includes(res.body.rateLimiting.backend));
  });

  // =========================================================================
  // 3. Distributed Rate Limiter
  // =========================================================================
  await t.test('RateLimiter: Enforces window limits and respects retryAfterSeconds', () => {
    const testLimiter = new RateLimiter({
      windowMs: 5000,
      maxRequests: 3,
      namespace: 'test_limit',
    });

    const key = `ip_${Date.now()}`;
    const r1 = testLimiter.consume(key);
    assert.strictEqual(r1.allowed, true);
    assert.strictEqual(r1.remaining, 2);

    const r2 = testLimiter.consume(key);
    assert.strictEqual(r2.allowed, true);
    assert.strictEqual(r2.remaining, 1);

    const r3 = testLimiter.consume(key);
    assert.strictEqual(r3.allowed, true);
    assert.strictEqual(r3.remaining, 0);

    const r4 = testLimiter.consume(key);
    assert.strictEqual(r4.allowed, false);
    assert.strictEqual(r4.remaining, 0);
    assert.ok(r4.retryAfterSeconds > 0, 'Retry-After is positive');
  });

  await t.test('RateLimiter: Key isolation prevents cross-key pollution', () => {
    const testLimiter = new RateLimiter({
      windowMs: 5000,
      maxRequests: 2,
      namespace: 'test_isolation',
    });

    const keyA = `user_a_${Date.now()}`;
    const keyB = `user_b_${Date.now()}`;

    testLimiter.consume(keyA);
    testLimiter.consume(keyA);
    const blockedA = testLimiter.consume(keyA);
    assert.strictEqual(blockedA.allowed, false, 'Key A is exhausted');

    // Key B must remain unaffected
    const allowedB = testLimiter.consume(keyB);
    assert.strictEqual(allowedB.allowed, true, 'Key B is independent and allowed');
  });

  await t.test('RateLimiter: Asynchronous consumeAsync handles concurrent requests accurately', async () => {
    const testLimiter = new RateLimiter({
      windowMs: 10000,
      maxRequests: 5,
      namespace: 'test_async',
    });

    const key = `async_key_${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 8 }).map(() => testLimiter.consumeAsync(key))
    );

    const allowed = results.filter((r) => r.allowed);
    const blocked = results.filter((r) => !r.allowed);

    assert.strictEqual(allowed.length, 5, 'Exactly 5 requests allowed');
    assert.strictEqual(blocked.length, 3, 'Remaining 3 requests blocked');
  });

  await t.test('RateLimiter: getRateLimiterStatus reports operational telemetry', () => {
    const status = getRateLimiterStatus();
    assert.ok(['redis', 'memory-fallback'].includes(status.backend));
    assert.strictEqual(typeof status.redisConfigured, 'boolean');
    assert.strictEqual(typeof status.redisConnected, 'boolean');
  });

  // =========================================================================
  // 4. Request Correlation & Access Logging (X-Request-Id)
  // =========================================================================
  await t.test('Correlation: Injects X-Request-Id and preserves incoming request IDs', async () => {
    // 1. Automatically generated ID
    const res1 = await apiRequest(serverCtx.baseUrl, '/api/health');
    const genId = res1.headers.get('x-request-id');
    assert.ok(genId, 'X-Request-Id header is present in response');
    assert.ok(genId.length >= 16, 'Request ID is of valid length');

    // 2. Preserves incoming client request ID
    const clientTraceId = `trace_${Date.now()}_abc123`;
    const res2 = await apiRequest(serverCtx.baseUrl, '/api/health', {
      headers: { 'x-request-id': clientTraceId },
    });
    assert.strictEqual(res2.headers.get('x-request-id'), clientTraceId, 'Incoming X-Request-Id preserved');
  });

  // =========================================================================
  // 5. Production Security Headers & CORS Enforcement
  // =========================================================================
  await t.test('Security: Security headers are strictly enforced on all API responses', async () => {
    const res = await apiRequest(serverCtx.baseUrl, '/api/health');
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.headers.get('permissions-policy')?.includes('camera=()'));
    assert.strictEqual(res.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.ok(res.headers.get('cache-control')?.includes('no-store'));
  });

  // =========================================================================
  // 6. Background Worker Manager & Overlap Protection
  // =========================================================================
  await t.test('Workers: Overlap protection prevents concurrent execution of the same job', async () => {
    let executionCount = 0;

    // Simulate slow job
    const slowJob = async () => {
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 80));
      return { count: executionCount };
    };

    const [res1, res2] = await Promise.all([
      workerManager.runJob('test_overlap_job', slowJob),
      workerManager.runJob('test_overlap_job', slowJob),
    ]);

    assert.ok(res1.success !== res2.success, 'One job succeeded and one was prevented from overlapping');
    const blocked = [res1, res2].find((r) => !r.success);
    assert.strictEqual(blocked?.error, 'OVERLAPPING_EXECUTION_PREVENTED');
  });

  await t.test('Workers: Idempotent maintenance jobs execute cleanly', async () => {
    const otpClean = await workerManager.runOtpCleanup();
    assert.strictEqual(otpClean.success, true);
    assert.ok(typeof otpClean.details?.deletedChallenges === 'number');

    const sessionClean = await workerManager.runSessionCleanup();
    assert.strictEqual(sessionClean.success, true);

    const voucherClean = await workerManager.runExpiredVouchersUpdate();
    assert.strictEqual(voucherClean.success, true);

    const subDowngrades = await workerManager.runSubscriptionDowngrades();
    assert.strictEqual(subDowngrades.success, true);
  });

  // =========================================================================
  // 7. Log & Error Sanitization
  // =========================================================================
  await t.test('Sanitization: Secret patterns are scrubbed from metadata objects', () => {
    const dirty = {
      user: 'john@example.com',
      password: 'MySecretPassword123!',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz',
      sessionToken: 'deadbeef12345678',
      otp: '654321',
      authorization: 'Bearer super_secret_jwt',
      webhookSecret: 'whsec_99999999',
      cookie: 'reployty_session=xyz',
      nested: {
        api_key: 'sk_live_12345',
        safeProperty: 'normal_value',
      },
    };

    const clean = sanitizeLogMetadata(dirty);
    assert.strictEqual(clean.user, 'john@example.com');
    assert.strictEqual(clean.password, '[REDACTED]');
    assert.strictEqual(clean.passwordHash, '[REDACTED]');
    assert.strictEqual(clean.sessionToken, '[REDACTED]');
    assert.strictEqual(clean.otp, '[REDACTED]');
    assert.strictEqual(clean.authorization, '[REDACTED]');
    assert.strictEqual(clean.webhookSecret, '[REDACTED]');
    assert.strictEqual(clean.cookie, '[REDACTED]');
    assert.strictEqual(clean.nested.api_key, '[REDACTED]');
    assert.strictEqual(clean.nested.safeProperty, 'normal_value');
  });
});
