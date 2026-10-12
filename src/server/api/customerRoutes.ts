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
import { CustomerEventType } from '@prisma/client';

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
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null) ||
    req.cookies?.[CUSTOMER_COOKIE_NAME];

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
 * Retrieves current customer profile, business branding, and active consents.
 * Supports ?qr= query parameter to scope context to a specific scanned QR business.
 */
customerRouter.get('/me', async (req: CustomerRequest, res: Response) => {
  try {
    const token =
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null) ||
      req.cookies?.[CUSTOMER_COOKIE_NAME];

    const sessionCtx = token ? await validateCustomerSession(token) : null;
    const qrParam = String(req.query.qr || req.headers['x-reployty-qr'] || '').trim();

    if (qrParam) {
      const resolved = await resolvePublicQr(qrParam);
      const targetBusiness = resolved.business;

      // If customer session belongs to the scanned business, return authenticated profile
      if (sessionCtx && sessionCtx.businessId === targetBusiness.id) {
        req.customerContext = sessionCtx;
        const profile = await getCustomerProfile(sessionCtx);
        res.json({
          ...profile,
          isAuthenticated: true,
          isEnrolled: true,
        });
        return;
      }

      // Customer is unauthenticated or not enrolled for this specific business
      const program = await prisma.loyaltyProgram.findFirst({
        where: { businessId: targetBusiness.id, status: 'ACTIVE' },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
          targetStamps: true,
          pointsPerCurrencyMinor: true,
          rewardTitle: true,
          status: true,
        },
      });

      res.json({
        customer: null,
        business: targetBusiness,
        branch: resolved.branch,
        consents: [],
        recentEvents: [],
        isAuthenticated: false,
        isEnrolled: false,
        loyaltyState: {
          hasActiveProgram: Boolean(program),
          program: program
            ? {
                id: program.id,
                name: program.name,
                type: program.type,
                targetStamps: program.targetStamps,
                pointsPerCurrencyMinor: program.pointsPerCurrencyMinor,
                rewardTitle: program.rewardTitle,
                status: program.status,
              }
            : null,
          card: null,
          progress: null,
        },
      });
      return;
    }

    // No QR specified: require active customer session
    if (!sessionCtx) {
      res.status(401).json({
        error: 'Unauthenticated: Customer session required',
        code: 'UNAUTHENTICATED_CUSTOMER',
      });
      return;
    }

    req.customerContext = sessionCtx;
    const profile = await getCustomerProfile(sessionCtx);
    res.json({
      ...profile,
      isAuthenticated: true,
      isEnrolled: true,
    });
  } catch (err: any) {
    if (err instanceof CustomerPwaError) {
      res.status(err.code === 'QR_NOT_FOUND' ? 404 : 400).json({ error: err.message, code: err.code });
      return;
    }
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
 * Returns the customer's live loyalty pass state for the requested business context.
 * Supports ?qr= query parameter to resolve business via verified QR code token.
 */
customerRouter.get('/loyalty', async (req: CustomerRequest, res: Response) => {
  try {
    const token =
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null) ||
      req.cookies?.[CUSTOMER_COOKIE_NAME];

    const sessionCtx = token ? await validateCustomerSession(token) : null;
    const qrParam = String(req.query.qr || req.headers['x-reployty-qr'] || '').trim();

    let targetBusinessId: string;
    let targetBusiness: any = null;
    let targetBranch: any = null;

    if (qrParam) {
      const resolved = await resolvePublicQr(qrParam);
      targetBusinessId = resolved.business.id;
      targetBusiness = resolved.business;
      targetBranch = resolved.branch;
    } else if (sessionCtx) {
      targetBusinessId = sessionCtx.businessId;
      targetBusiness = sessionCtx.business;
    } else {
      res.status(401).json({
        error: 'Unauthenticated: Customer session or QR code required',
        code: 'UNAUTHENTICATED_CUSTOMER',
      });
      return;
    }

    // Check if the authenticated customer session matches the requested business
    if (sessionCtx && sessionCtx.businessId === targetBusinessId) {
      req.customerContext = sessionCtx;
      const data = await getCustomerLoyaltyState(sessionCtx);
      res.json({
        status: 'ACTIVE',
        isEnrolled: true,
        ...data,
      });
      return;
    }

    // Customer is not enrolled in this business (either unauthenticated, or authenticated for a different business)
    // Fetch active loyalty program for the requested business
    const program = await prisma.loyaltyProgram.findFirst({
      where: {
        businessId: targetBusinessId,
        status: 'ACTIVE',
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        type: true,
        targetStamps: true,
        pointsPerCurrencyMinor: true,
        rewardTitle: true,
        status: true,
      },
    });

    if (!targetBusiness) {
      targetBusiness = await prisma.business.findUnique({
        where: { id: targetBusinessId },
        select: {
          id: true,
          name: true,
          category: true,
          themePreset: true,
          primaryColor: true,
          secondaryColor: true,
          logo: true,
          currency: true,
          googleReviewUrl: true,
          instagramUrl: true,
          facebookUrl: true,
        },
      });
    }

    res.json({
      status: 'UNENROLLED',
      isEnrolled: false,
      requiresEnrollment: true,
      hasActiveProgram: Boolean(program),
      program: program
        ? {
            id: program.id,
            name: program.name,
            type: program.type,
            targetStamps: program.targetStamps,
            pointsPerCurrencyMinor: program.pointsPerCurrencyMinor,
            rewardTitle: program.rewardTitle,
            status: program.status,
          }
        : null,
      business: targetBusiness,
      branch: targetBranch,
      customer: null,
      card: null,
      progress: program
        ? {
            currentStamps: 0,
            targetStamps: program.targetStamps || 10,
            stampsRemaining: program.targetStamps || 10,
            isComplete: false,
            currentPoints: 0,
            pointsConversionLabel:
              program.type === 'POINTS'
                ? `1 point per ₹${((program.pointsPerCurrencyMinor || 1000) / 100).toFixed(0)}`
                : null,
          }
        : null,
      recentTransactions: [],
      message: 'Please join or verify your phone to access your loyalty card for this business.',
    });
  } catch (err: any) {
    if (err instanceof CustomerPwaError) {
      res.status(err.code === 'QR_NOT_FOUND' ? 404 : 400).json({ error: err.message, code: err.code });
      return;
    }
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
    const qrIdentifier = req.query.qr;
    if (qrIdentifier) {
      const resolved = await resolvePublicQr(String(qrIdentifier));
      if (resolved.business.id !== req.customerContext!.businessId) {
        res.status(403).json({
          error: 'Customer session does not match requested business QR code',
          code: 'CROSS_TENANT_FORBIDDEN',
        });
        return;
      }
    }
    const state = await getCustomerReviewState(req.customerContext!);
    res.json(state);
  } catch (err: any) {
    if (err instanceof CustomerPwaError) {
      const status = err.code === 'QR_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
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
    const { qrCode, qrToken } = req.body;
    const resolvedQr = qrCode || qrToken || req.query.qr;
    if (resolvedQr) {
      const resolved = await resolvePublicQr(String(resolvedQr));
      if (resolved.business.id !== req.customerContext!.businessId) {
        res.status(403).json({
          error: 'Customer session does not match requested business QR code',
          code: 'CROSS_TENANT_FORBIDDEN',
        });
        return;
      }
    }
    const result = await submitCustomerReview(req.customerContext!, req.body);
    res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof CustomerPwaError) {
      const status = err.code === 'QR_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
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
 * Resolves business context authoritatively from the scanned QR code.
 * Prevents cross-business customer session hijacking.
 */
customerRouter.post('/reviews/suggest', async (req: Request, res: Response) => {
  try {
    const { rating, feedbackText, language, qrCode, qrToken } = req.body;
    const resolvedQr = qrCode || qrToken || (typeof req.query.qr === 'string' ? req.query.qr : undefined);

    const numRating = Number(rating);
    if (!numRating || isNaN(numRating) || numRating < 1 || numRating > 5) {
      res.status(400).json({
        error: 'Rating must be an integer between 1 and 5',
        code: 'INVALID_RATING',
      });
      return;
    }

    // 1. Authoritative business context resolution:
    // QR token is primary authoritative identifier for public customer flows
    let businessId: string | null = null;

    if (resolvedQr) {
      const resolved = await resolvePublicQr(String(resolvedQr));
      businessId = resolved.business.id;
    } else {
      // No QR token provided — must rely on authenticated customer session
      const token =
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null) ||
        req.cookies?.[CUSTOMER_COOKIE_NAME];
      if (token) {
        try {
          const ctx = await validateCustomerSession(token);
          if (ctx) {
            businessId = ctx.businessId;
          }
        } catch {
          // Token invalid
        }
      }
    }

    if (!businessId) {
      res.status(401).json({
        error: 'Authentication or valid QR code required to generate review suggestions',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        logo: true,
        googleReviewUrl: true,
        instagramUrl: true,
        facebookUrl: true,
      },
    });

    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }

    const normLang = String(language || 'ENGLISH').toUpperCase();
    const suggestionsResult = generateCustomerReviewSuggestion({
      businessName: business.name,
      category: business.category,
      description: business.description,
      rating: Math.round(numRating),
      feedbackText,
      language: normLang,
    });

    res.json({
      success: true,
      businessId: business.id,
      suggestions: suggestionsResult.options,
      options: suggestionsResult.options,
      allOptions: suggestionsResult.allOptions,
      selectedLanguage: normLang,
      language: normLang,
      rating: Math.round(numRating),
      googleReviewUrl: business.googleReviewUrl,
      instagramUrl: business.instagramUrl,
      facebookUrl: business.facebookUrl,
      businessName: business.name,
      businessLogo: business.logo,
    });
  } catch (err: any) {
    if (err instanceof CustomerPwaError) {
      const status = err.code === 'QR_NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: err.message || 'Failed to generate review suggestions' });
  }
});

/**
 * POST /api/customer/reviews/events
 * Records customer review interaction events (e.g. CUSTOMER_REVIEW_COPIED, GOOGLE_REVIEW_OPENED, etc.)
 */
customerRouter.post('/reviews/events', async (req: Request, res: Response) => {
  try {
    const { event, eventType, qrCode, qrToken, metadata } = req.body;
    const resolvedEvent = event || eventType;
    const resolvedQr = qrCode || qrToken || (typeof req.query.qr === 'string' ? req.query.qr : undefined);

    if (!resolvedEvent) {
      res.status(400).json({ error: 'Event name is required', code: 'VALIDATION_ERROR' });
      return;
    }

    let businessId: string | null = null;
    let customerId: string | null = null;

    if (resolvedQr) {
      try {
        const resolved = await resolvePublicQr(String(resolvedQr));
        businessId = resolved.business.id;

        const token =
          (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null) ||
          req.cookies?.[CUSTOMER_COOKIE_NAME];
        if (token) {
          const ctx = await validateCustomerSession(token);
          if (ctx && ctx.businessId === businessId) {
            customerId = ctx.customerId;
          }
        }
      } catch {
        // Ignore unverified QR for event
      }
    } else {
      const token =
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null) ||
        req.cookies?.[CUSTOMER_COOKIE_NAME];
      if (token) {
        const ctx = await validateCustomerSession(token);
        if (ctx) {
          businessId = ctx.businessId;
          customerId = ctx.customerId;
        }
      }
    }

    if (businessId && customerId) {
      await prisma.customerEvent.create({
        data: {
          businessId,
          customerId,
          type: CustomerEventType.REVIEW_GENERATED,
          metadata: {
            action: resolvedEvent,
            ...(metadata || {}),
            timestamp: new Date().toISOString(),
          },
        },
      });
    }

    res.json({ success: true, event: resolvedEvent, businessId });
  } catch (err: any) {
    res.status(200).json({ success: false, error: err.message });
  }
});




