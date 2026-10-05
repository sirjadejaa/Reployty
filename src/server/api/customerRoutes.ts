import { Router, Request, Response, NextFunction } from 'express';
import { requestOtp, verifyOtp, OtpError } from '../services/otpService';
import {
  createCustomerSession,
  validateCustomerSession,
  revokeCustomerSession,
  findOrCreateCustomer,
  CustomerSessionContext,
  CustomerAuthError,
} from '../services/customerAuthService';
import {
  resolvePublicQr,
  getCustomerProfile,
  updateCustomerProfile,
  updateCustomerConsent,
  getCustomerActivity,
  CustomerPwaError,
} from '../services/customerPwaService';
import {
  getCustomerLoyaltyState,
  getCustomerLoyaltyHistory,
  claimCustomerQrEarning,
  LoyaltyOperationError,
} from '../services/loyaltyService';
import {
  getCustomerRewards,
  claimCustomerReward,
  getCustomerRedemptions,
} from '../services/rewardService';
import { getCustomerCatalog } from '../services/catalogService';
import { getCustomerEligibleOffers } from '../services/offerService';
import {
  submitCustomerReview,
  getCustomerReviewState,
  generateCustomerReviewSuggestion,
  ReviewOperationError,
} from '../services/reviewService';
import { prisma } from '../db/client';

export const customerRouter = Router();

const CUSTOMER_COOKIE_NAME = 'reployty_customer_session';

export interface CustomerRequest extends Request {
  customerContext?: CustomerSessionContext;
}

/**
 * Middleware: Enforces that the request has an active, authenticated customer session.
 * Does NOT accept business user sessions or staff credentials.
 */
export async function requireCustomerAuth(
  req: CustomerRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token =
    req.cookies?.[CUSTOMER_COOKIE_NAME] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (!token) {
    res.status(401).json({
      error: 'Unauthenticated: Customer session required',
      code: 'UNAUTHENTICATED_CUSTOMER',
    });
    return;
  }

  try {
    const ctx = await validateCustomerSession(token);
    if (!ctx) {
      res.status(401).json({
        error: 'Invalid or expired customer session. Please verify your phone again.',
        code: 'INVALID_CUSTOMER_SESSION',
      });
      return;
    }
    req.customerContext = ctx;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: err.message || 'Customer authorization failed',
      code: 'CUSTOMER_AUTH_FAILED',
    });
  }
}

// ============================================================================
// PUBLIC CUSTOMER ENDPOINTS (QR, OTP, LOGIN)
// ============================================================================

/**
 * GET /api/customer/qr/:code
 * Resolves a public QR code or business slug into public-safe context.
 */
customerRouter.get('/qr/:code', async (req: Request, res: Response) => {
  try {
    const data = await resolvePublicQr(String(req.params.code));
    res.json(data);
  } catch (err: any) {
    if (err instanceof CustomerPwaError) {
      const status = err.code === 'QR_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message || 'Internal server error', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/customer/auth/request-otp
 * Requests a single-use OTP challenge for a given phone and business.
 */
customerRouter.post('/auth/request-otp', async (req: Request, res: Response) => {
  try {
    const { businessId, phone } = req.body;
    if (!businessId || !phone) {
      res.status(400).json({
        error: 'Business ID and phone number are required',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await requestOtp({
      businessId,
      phone,
      ipAddress,
      userAgent,
    });

    res.json({
      success: true,
      challengeId: result.challengeId,
      expiresInSeconds: result.expiresInSeconds,
      devOtp: result.devOtp, // Only present in simulation/test mode
    });
  } catch (err: any) {
    if (err instanceof OtpError) {
      const status = err.code === 'RATE_LIMIT_EXCEEDED' ? 429 : 400;
      res.status(status).json({
        error: err.message,
        code: err.code,
        details: err.details,
      });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to send OTP', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/customer/auth/verify-otp
 * Verifies the OTP, creates or retrieves the business customer, and sets the customer cookie.
 */
customerRouter.post('/auth/verify-otp', async (req: Request, res: Response) => {
  try {
    const { businessId, phone, code, challengeId, name, email, birthday, marketingConsent, branchId } = req.body;

    if (!businessId || !phone || !code) {
      res.status(400).json({
        error: 'Business ID, phone number, and verification code are required',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    // 1. Verify OTP code
    const verification = await verifyOtp({
      businessId,
      phone,
      code,
      challengeId,
    });

    // 2. Concurrency-safe customer lookup or creation
    const { customer, isNew } = await findOrCreateCustomer(businessId, verification.phone, {
      name,
      email,
      birthday: birthday ? new Date(birthday) : undefined,
      marketingConsent: Boolean(marketingConsent),
      branchId,
      source: 'PWA_QR_VERIFICATION',
    });

    // 3. Establish Customer Session
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const session = await createCustomerSession(customer.id, businessId, ipAddress, userAgent);

    // 4. Set HttpOnly Cookie
    res.cookie(CUSTOMER_COOKIE_NAME, session.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    res.json({
      success: true,
      isNew,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        status: customer.status,
        marketingConsent: customer.marketingConsent,
        totalVisits: customer.totalVisits,
        stampsBalance: customer.stampsBalance,
        pointsBalance: customer.pointsBalance,
        joinedAt: customer.joinedAt,
      },
      sessionToken: session.sessionToken,
    });
  } catch (err: any) {
    if (err instanceof OtpError || err instanceof CustomerAuthError) {
      res.status(400).json({
        error: err.message,
        code: err.code,
        details: (err as any).details,
      });
      return;
    }
    res.status(500).json({ error: err.message || 'OTP verification failed', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/customer/auth/logout
 * Revokes the customer session and clears the customer cookie.
 */
customerRouter.post('/auth/logout', async (req: Request, res: Response) => {
  const token =
    req.cookies?.[CUSTOMER_COOKIE_NAME] ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (token) {
    await revokeCustomerSession(token);
  }

  res.clearCookie(CUSTOMER_COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Customer session logged out' });
});

// ============================================================================
// PROTECTED CUSTOMER ENDPOINTS (REQUIRE requireCustomerAuth)
// ============================================================================

/**
 * GET /api/customer/me
 * Retrieves current authenticated customer profile, business branding, and active consents.
 */
customerRouter.get('/me', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const profile = await getCustomerProfile(req.customerContext!);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch customer profile' });
  }
});

/**
 * PUT /api/customer/profile
 * Updates customer personal details (name, email, birthday).
 */
customerRouter.put('/profile', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const updated = await updateCustomerProfile(req.customerContext!, req.body);
    res.json({
      success: true,
      customer: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        email: updated.email,
        birthday: updated.birthday,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update profile' });
  }
});

/**
 * PUT /api/customer/consent
 * Updates channel consent preferences (marketing, notification).
 */
customerRouter.put('/consent', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const { channel, granted } = req.body;
    if (!channel || typeof granted !== 'boolean') {
      res.status(400).json({
        error: 'Channel and boolean granted status are required',
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    const consent = await updateCustomerConsent(req.customerContext!, {
      channel,
      granted,
    });

    res.json({ success: true, consent });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update consent' });
  }
});

/**
 * GET /api/customer/activity
 * Retrieves the customer's timeline events for this business.
 */
customerRouter.get('/activity', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const events = await getCustomerActivity(req.customerContext!);
    res.json(events);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load activity timeline' });
  }
});

/**
 * GET /api/customer/loyalty
 * Returns the authenticated customer's live loyalty pass state (stamps progress or points balance).
 */
customerRouter.get('/loyalty', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const data = await getCustomerLoyaltyState(req.customerContext!);
    res.json({
      status: 'PHASE_7_SETUP',
      ...data,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve loyalty pass' });
  }
});

/**
 * GET /api/customer/loyalty/history
 * Returns the authenticated customer's own loyalty activity history.
 */
customerRouter.get('/loyalty/history', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const history = await getCustomerLoyaltyHistory(req.customerContext!);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve loyalty history' });
  }
});

/**
 * POST /api/customer/loyalty/enroll
 * Explicitly enrolls customer in the active loyalty program.
 */
customerRouter.post('/loyalty/enroll', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const data = await getCustomerLoyaltyState(req.customerContext!);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to enroll in loyalty program' });
  }
});

/**
 * GET /api/customer/rewards
 * Returns server-authoritative reward catalogue with customer eligibility evaluation.
 */
customerRouter.get('/rewards', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const data = await getCustomerRewards(req.customerContext!);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load customer rewards' });
  }
});

/**
 * POST /api/customer/rewards/:id/claim
 * Atomically claims an eligible reward and generates single-use redemption code.
 */
customerRouter.post('/rewards/:id/claim', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const redemption = await claimCustomerReward(
      req.customerContext!,
      String(req.params.id),
      { idempotencyKey: req.body?.idempotencyKey }
    );
    res.status(201).json({ success: true, redemption });
  } catch (err: any) {
    const status =
      err.code === 'INSUFFICIENT_STAMPS' || err.code === 'INSUFFICIENT_POINTS'
        ? 400
        : err.code === 'CUSTOMER_LIMIT_REACHED' || err.code === 'TOTAL_LIMIT_REACHED'
        ? 409
        : err.code === 'REWARD_NOT_ACTIVE'
        ? 404
        : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

/**
 * GET /api/customer/redemptions
 * Returns the customer's own active and historical redemptions.
 */
customerRouter.get('/redemptions', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const redemptions = await getCustomerRedemptions(req.customerContext!);
    res.json(redemptions);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load redemptions' });
  }
});

/**
 * GET /api/customer/catalog
 * Returns the customer-facing read-only active catalog (menus, services, products) for their current business.
 */
customerRouter.get('/catalog', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const catalog = await getCustomerCatalog(req.customerContext!);
    res.json(catalog);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load customer catalog' });
  }
});

/**
 * GET /api/customer/offers
 * Returns active promotions and discounts available for the logged-in customer.
 */
customerRouter.get('/offers', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const offers = await getCustomerEligibleOffers(req.customerContext!);
    res.json(offers);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load offers' });
  }
});

/**
 * GET /api/customer/reviews/status
 * Returns customer's review history and the business's Google review configuration.
 */
customerRouter.get('/reviews/status', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const state = await getCustomerReviewState(req.customerContext!);
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get review status' });
  }
});

/**
 * POST /api/customer/reviews
 * Submits 1-5 star review.
 * 4-5 stars -> Positive -> Google Review CTA
 * 1-3 stars -> Neutral/Negative -> Private Feedback (CRM)
 */
customerRouter.post('/reviews', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const result = await submitCustomerReview(req.customerContext!, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    const status = err instanceof ReviewOperationError ? err.statusCode : 400;
    res.status(status).json({ error: err.message || 'Failed to submit review' });
  }
});

/**
 * POST /api/customer/qr/claim-earning
 * Automatically claims loyalty stamp or points when customer scans the store QR code.
 * Replaces manual staff button presses with secure customer self-serve earning.
 */
customerRouter.post('/qr/claim-earning', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const { qrCode, idempotencyKey } = req.body;
    if (!qrCode) {
      res.status(400).json({ error: 'QR code is required', code: 'VALIDATION_ERROR' });
      return;
    }

    const result = await claimCustomerQrEarning(req.customerContext!, {
      qrCode,
      idempotencyKey,
    });

    res.json(result);
  } catch (err: any) {
    if (err instanceof LoyaltyOperationError) {
      const status =
        err.code === 'INVALID_QR'
          ? 404
          : err.code === 'CROSS_TENANT_EARNING_FORBIDDEN'
          ? 403
          : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to claim loyalty earning', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/customer/reviews/suggest
 * Generates AI-assisted review suggestions in English, Hinglish, and Hindi
 * based on selected star rating and business category.
 */
customerRouter.post('/reviews/suggest', requireCustomerAuth, async (req: CustomerRequest, res: Response) => {
  try {
    const { rating, feedbackText } = req.body;
    const business = await prisma.business.findUnique({
      where: { id: req.customerContext!.businessId },
      select: {
        id: true,
        name: true,
        category: true,
        googleReviewUrl: true,
        instagramUrl: true,
        facebookUrl: true,
      },
    });

    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    const suggestions = generateCustomerReviewSuggestion({
      businessName: business.name,
      category: business.category,
      rating: Number(rating) || 5,
      feedbackText,
    });

    res.json({
      suggestions,
      googleReviewUrl: business.googleReviewUrl,
      instagramUrl: business.instagramUrl,
      facebookUrl: business.facebookUrl,
      businessName: business.name,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate review suggestions' });
  }
});




