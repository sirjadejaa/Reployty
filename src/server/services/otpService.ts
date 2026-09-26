import crypto from 'crypto';
import { prisma } from '../db/client';
import { RateLimiter } from '../auth/rateLimiter';

const OTP_SECRET = process.env.OTP_SECRET || 'reployty_otp_secure_pepper_2026';
const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export class OtpError extends Error {
  constructor(message: string, public code: string = 'OTP_ERROR', public details?: Record<string, unknown>) {
    super(message);
    this.name = 'OtpError';
  }
}

// In-memory sliding-window limiters
// 5 OTP requests per 15 minutes per phone/IP
export const otpRequestLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

// Resend cooldown tracking: key -> timestamp of next allowed request
const resendCooldowns = new Map<string, number>();

/**
 * Normalizes phone numbers to standard E.164 format.
 * Strips whitespace, dashes, parentheses. Ensures leading '+'.
 */
export function normalizePhoneNumber(rawPhone: string, defaultCountryCode: string = '+1'): string {
  if (!rawPhone) return '';
  let cleaned = rawPhone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    // If standard 10-digit number without country code, prepend defaultCountryCode
    if (cleaned.length === 10) {
      cleaned = `${defaultCountryCode}${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

/**
 * Provider interface for dispatching OTP via SMS or messaging channels.
 */
export interface OtpProvider {
  sendOtp(phone: string, code: string, businessName: string): Promise<void>;
}

export class DevSimulationOtpProvider implements OtpProvider {
  async sendOtp(phone: string, code: string, businessName: string): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SIMULATION OTP] Sent to ${phone} for ${businessName}: ${code}`);
    } else {
      console.log(`[OTP DISPATCH] Dispatched verification challenge to masked phone`);
    }
  }
}

let currentProvider: OtpProvider = new DevSimulationOtpProvider();

export function setOtpProvider(provider: OtpProvider) {
  currentProvider = provider;
}

export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(`${code}:${OTP_SECRET}`).digest('hex');
}

/**
 * Constant-time hash comparison to prevent timing side-channel attacks.
 */
export function safeCompareHashes(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export interface RequestOtpParams {
  businessId: string;
  phone: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Requests an OTP challenge for a phone number and business.
 */
export async function requestOtp(params: RequestOtpParams): Promise<{
  challengeId: string;
  expiresInSeconds: number;
  devOtp?: string;
}> {
  const normalizedPhone = normalizePhoneNumber(params.phone);
  if (!normalizedPhone || normalizedPhone.length < 8) {
    throw new OtpError('Invalid phone number format', 'INVALID_PHONE');
  }

  // 1. Verify business exists and is active
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { id: true, name: true, status: true },
  });

  if (!business || business.status !== 'ACTIVE') {
    throw new OtpError('Business is currently unavailable', 'BUSINESS_UNAVAILABLE');
  }

  // 2. Enforce Resend Cooldown (60 seconds)
  const cooldownKey = `${params.businessId}:${normalizedPhone}`;
  const now = Date.now();
  const nextAllowed = resendCooldowns.get(cooldownKey) || 0;
  if (now < nextAllowed) {
    const waitSeconds = Math.ceil((nextAllowed - now) / 1000);
    throw new OtpError(
      `Please wait ${waitSeconds}s before requesting a new code`,
      'COOLDOWN_ACTIVE',
      { retryAfterSeconds: waitSeconds }
    );
  }

  // 3. Enforce Rate Limiting (5 requests per 15 minutes)
  const rateLimitKey = `${params.ipAddress || 'anon'}:${normalizedPhone}`;
  const rateCheck = otpRequestLimiter.consume(rateLimitKey);
  if (!rateCheck.allowed) {
    throw new OtpError(
      `Too many OTP requests. Please wait ${rateCheck.retryAfterSeconds}s before trying again.`,
      'RATE_LIMIT_EXCEEDED',
      { retryAfterSeconds: rateCheck.retryAfterSeconds }
    );
  }

  // 4. Generate 6-digit random code
  const randomInt = crypto.randomInt(100000, 999999);
  const otpCode = randomInt.toString();
  const codeHash = hashOtpCode(otpCode);
  const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate any existing unconsumed challenges for this phone + business
  await prisma.customerOtpChallenge.updateMany({
    where: {
      businessId: params.businessId,
      phone: normalizedPhone,
      consumedAt: null,
    },
    data: {
      consumedAt: new Date(),
    },
  });

  // 5. Create Challenge Record
  const challenge = await prisma.customerOtpChallenge.create({
    data: {
      businessId: params.businessId,
      phone: normalizedPhone,
      codeHash,
      expiresAt,
      maxAttempts: OTP_MAX_ATTEMPTS,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    },
  });

  // Set cooldown
  resendCooldowns.set(cooldownKey, now + RESEND_COOLDOWN_MS);

  // 6. Send via Provider
  await currentProvider.sendOtp(normalizedPhone, otpCode, business.name);

  // In test / simulation / non-production environment, return devOtp for seamless verification
  const isSimulation = process.env.CUSTOMER_OTP_PROVIDER === 'simulation' || process.env.NODE_ENV !== 'production';

  return {
    challengeId: challenge.id,
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    devOtp: process.env.NODE_ENV === 'production' ? undefined : (isSimulation ? otpCode : undefined),
  };
}

export interface VerifyOtpParams {
  businessId: string;
  phone: string;
  code: string;
  challengeId?: string;
}

/**
 * Verifies submitted OTP against the active challenge.
 * Returns normalized phone upon successful single-use verification.
 */
export async function verifyOtp(params: VerifyOtpParams): Promise<{
  verified: boolean;
  phone: string;
  businessId: string;
}> {
  const normalizedPhone = normalizePhoneNumber(params.phone);
  const submittedHash = hashOtpCode(params.code.trim());

  // Find the active challenge
  const whereClause: {
    businessId: string;
    phone: string;
    consumedAt: null;
    id?: string;
  } = {
    businessId: params.businessId,
    phone: normalizedPhone,
    consumedAt: null,
  };

  if (params.challengeId) {
    whereClause.id = params.challengeId;
  }

  const challenge = await prisma.customerOtpChallenge.findFirst({
    where: whereClause,
    orderBy: { createdAt: 'desc' },
  });

  if (!challenge) {
    throw new OtpError('Verification code expired or not found. Please request a new code.', 'OTP_EXPIRED');
  }

  // Check expiration
  if (challenge.expiresAt < new Date()) {
    await prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    throw new OtpError('That code has expired. Request a new code.', 'OTP_EXPIRED');
  }

  // Check attempt limit
  if (challenge.attempts >= challenge.maxAttempts) {
    await prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    throw new OtpError('Too many failed attempts. Please request a new code.', 'TOO_MANY_ATTEMPTS');
  }

  // Timing-safe constant-time hash comparison
  if (!safeCompareHashes(challenge.codeHash, submittedHash)) {
    const updated = await prisma.customerOtpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = challenge.maxAttempts - updated.attempts;
    if (remaining <= 0) {
      await prisma.customerOtpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new OtpError('Too many failed attempts. Please request a new code.', 'TOO_MANY_ATTEMPTS');
    }
    throw new OtpError(`Incorrect verification code. ${remaining} attempt(s) remaining.`, 'INVALID_OTP', {
      remainingAttempts: remaining,
    });
  }

  // Code is valid! Mark single-use consumption
  await prisma.customerOtpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  // Clear cooldown so they can re-authenticate later without waiting if needed
  resendCooldowns.delete(`${params.businessId}:${normalizedPhone}`);

  return {
    verified: true,
    phone: normalizedPhone,
    businessId: params.businessId,
  };
}
