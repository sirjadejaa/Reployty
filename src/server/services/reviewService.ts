import { prisma } from '../db/client';
import { TenantContext } from '../auth/tenantContext';
import { requireFeature, requireUsageLimit } from './entitlementService';
import { CustomerSessionContext } from './customerAuthService';
import {
  ReviewFeedback,
  ReviewGeneration,
  ReviewMetrics,
  ReviewSentiment,
  SubmitReviewPayload,
  CustomerReviewState,
  GenerateAiDraftPayload,
  UpdateGenerationPayload,
} from '../../types/reviews';

export class ReviewOperationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'ReviewOperationError';
    this.statusCode = statusCode;
  }
}

function requirePermission(ctx: TenantContext, permissionCode: string) {
  if (!ctx.hasPermission(permissionCode) && !ctx.isOwner && !ctx.isSuperAdmin) {
    throw new ReviewOperationError(`Missing required permission: ${permissionCode}`, 403);
  }
}

/**
 * Customer Review Submission (Phase 13 Flow)
 * 4-5 Stars -> Positive -> Google Review Target
 * 1-3 Stars -> Neutral/Negative -> Private Feedback (CRM)
 */
export async function submitCustomerReview(
  session: CustomerSessionContext,
  payload: SubmitReviewPayload
): Promise<{
  review: ReviewFeedback;
  sentiment: ReviewSentiment;
  isPublicGoogleReviewTarget: boolean;
  googleReviewUrl: string | null;
  businessName: string;
}> {
  const rating = Math.round(Number(payload.rating));
  if (isNaN(rating) || rating < 1 || rating > 5) {
    throw new ReviewOperationError('Rating must be an integer between 1 and 5', 400);
  }

  // Branch routing / business verification
  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: { id: true, name: true, googleReviewUrl: true },
  });

  if (!business) {
    throw new ReviewOperationError('Business tenant not found', 404);
  }

  // Calculate sentiment & Google review targeting
  let sentiment: ReviewSentiment;
  let isPublicGoogleReviewTarget = false;

  if (rating >= 4) {
    sentiment = 'POSITIVE';
    isPublicGoogleReviewTarget = true;
  } else if (rating === 3) {
    sentiment = 'NEUTRAL';
    isPublicGoogleReviewTarget = false;
  } else {
    sentiment = 'NEGATIVE';
    isPublicGoogleReviewTarget = false;
  }

  // Clean feedback text
  const feedbackText = payload.feedbackText?.trim() || null;

  // Persist review feedback
  const createdReview = await prisma.reviewFeedback.create({
    data: {
      businessId: session.businessId,
      branchId: payload.branchId || null,
      customerId: session.customerId,
      rating,
      feedbackText,
      sentiment,
      isPublicGoogleReviewTarget,
    },
    include: {
      branch: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  // Record customer timeline event
  await prisma.customerEvent.create({
    data: {
      businessId: session.businessId,
      customerId: session.customerId,
      type: isPublicGoogleReviewTarget ? 'REVIEW_GENERATED' : 'REVIEW_REQUESTED',
      metadata: {
        reviewId: createdReview.id,
        rating,
        sentiment,
        isPublicGoogleReviewTarget,
        category: payload.category || null,
      },
    },
  });

  return {
    review: {
      id: createdReview.id,
      businessId: createdReview.businessId,
      branchId: createdReview.branchId,
      branchName: createdReview.branch?.name,
      customerId: createdReview.customerId,
      customerName: createdReview.customer?.name,
      customerPhone: createdReview.customer?.phone,
      rating: createdReview.rating,
      feedbackText: createdReview.feedbackText,
      sentiment: createdReview.sentiment as ReviewSentiment,
      isPublicGoogleReviewTarget: createdReview.isPublicGoogleReviewTarget,
      category: payload.category || null,
      createdAt: createdReview.createdAt.toISOString(),
      updatedAt: createdReview.updatedAt.toISOString(),
    },
    sentiment,
    isPublicGoogleReviewTarget,
    googleReviewUrl: business.googleReviewUrl,
    businessName: business.name,
  };
}

/**
 * Get current customer review state & business review info
 */
export async function getCustomerReviewState(
  session: CustomerSessionContext
): Promise<CustomerReviewState> {
  const business = await prisma.business.findUnique({
    where: { id: session.businessId },
    select: {
      name: true,
      category: true,
      logo: true,
      googleReviewUrl: true,
      instagramUrl: true,
      facebookUrl: true,
    },
  });

  const latestReview = await prisma.reviewFeedback.findFirst({
    where: {
      businessId: session.businessId,
      customerId: session.customerId,
    },
    orderBy: { createdAt: 'desc' },
  });

  return {
    hasReviewed: !!latestReview,
    latestReview: latestReview
      ? {
          id: latestReview.id,
          rating: latestReview.rating,
          feedbackText: latestReview.feedbackText,
          isPublicGoogleReviewTarget: latestReview.isPublicGoogleReviewTarget,
          createdAt: latestReview.createdAt.toISOString(),
        }
      : null,
    googleReviewUrl: business?.googleReviewUrl || null,
    instagramUrl: business?.instagramUrl || null,
    facebookUrl: business?.facebookUrl || null,
    businessLogo: business?.logo || null,
    businessName: business?.name || 'Local Business',
    category: business?.category || null,
  };
}

/**
 * Retrieve paginated business reviews with filters and search
 */
export async function getBusinessReviews(
  ctx: TenantContext,
  params: {
    page?: number;
    limit?: number;
    rating?: number;
    sentiment?: ReviewSentiment;
    isPublicGoogleReviewTarget?: boolean;
    branchId?: string;
    status?: 'UNRESPONDED' | 'DRAFTED' | 'COPIED';
    search?: string;
  } = {}
): Promise<{
  reviews: ReviewFeedback[];
  total: number;
  page: number;
  totalPages: number;
}> {
  requirePermission(ctx, 'REVIEWS_VIEW');

  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const skip = (page - 1) * limit;

  const where: any = {
    businessId: ctx.businessId,
  };

  if (ctx.branchId) {
    where.branchId = ctx.branchId;
  } else if (params.branchId) {
    where.branchId = params.branchId;
  }

  if (params.rating) {
    where.rating = Number(params.rating);
  }

  if (params.sentiment) {
    where.sentiment = params.sentiment;
  }

  if (typeof params.isPublicGoogleReviewTarget === 'boolean') {
    where.isPublicGoogleReviewTarget = params.isPublicGoogleReviewTarget;
  }

  if (params.search?.trim()) {
    const term = params.search.trim();
    where.OR = [
      { feedbackText: { contains: term, mode: 'insensitive' } },
      { customer: { name: { contains: term, mode: 'insensitive' } } },
      { customer: { phone: { contains: term } } },
    ];
  }

  if (params.status === 'UNRESPONDED') {
    where.generations = { none: {} };
  } else if (params.status === 'DRAFTED') {
    where.generations = { some: { status: 'DRAFT' } };
  } else if (params.status === 'COPIED') {
    where.generations = { some: { status: 'COPIED_TO_GOOGLE' } };
  }

  const [total, rawReviews] = await Promise.all([
    prisma.reviewFeedback.count({ where }),
    prisma.reviewFeedback.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        generations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
  ]);

  const reviews: ReviewFeedback[] = rawReviews.map((r) => {
    const latestGen = r.generations[0];
    return {
      id: r.id,
      businessId: r.businessId,
      branchId: r.branchId,
      branchName: r.branch?.name,
      customerId: r.customerId,
      customerName: r.customer?.name,
      customerPhone: r.customer?.phone,
      rating: r.rating,
      feedbackText: r.feedbackText,
      sentiment: r.sentiment as ReviewSentiment,
      isPublicGoogleReviewTarget: r.isPublicGoogleReviewTarget,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      latestGeneration: latestGen
        ? {
            id: latestGen.id,
            feedbackId: latestGen.feedbackId,
            businessId: latestGen.businessId,
            generatedEnglish: latestGen.generatedEnglish,
            generatedHinglish: latestGen.generatedHinglish,
            generatedHindi: latestGen.generatedHindi,
            selectedVersion: latestGen.selectedVersion as any,
            editedText: latestGen.editedText,
            status: latestGen.status,
            createdAt: latestGen.createdAt.toISOString(),
            updatedAt: latestGen.updatedAt.toISOString(),
          }
        : null,
    };
  });

  return {
    reviews,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Business Review Reputation Metrics
 */
export async function getBusinessReviewMetrics(ctx: TenantContext): Promise<ReviewMetrics> {
  requirePermission(ctx, 'REVIEWS_VIEW');

  const where: any = { businessId: ctx.businessId };
  if (ctx.branchId) {
    where.branchId = ctx.branchId;
  }

  const reviews = await prisma.reviewFeedback.findMany({
    where,
    select: {
      id: true,
      rating: true,
      sentiment: true,
      isPublicGoogleReviewTarget: true,
      generations: { select: { id: true, status: true }, take: 1 },
    },
  });

  const totalReviews = reviews.length;
  const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  let totalRatingSum = 0;
  let googleTargetCount = 0;
  let privateFeedbackCount = 0;
  let responseCount = 0;

  for (const r of reviews) {
    totalRatingSum += r.rating;
    if (r.rating >= 1 && r.rating <= 5) {
      ratingDistribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
    }

    if (r.sentiment === 'POSITIVE') sentimentCounts.positive++;
    else if (r.sentiment === 'NEUTRAL') sentimentCounts.neutral++;
    else if (r.sentiment === 'NEGATIVE') sentimentCounts.negative++;

    if (r.isPublicGoogleReviewTarget) {
      googleTargetCount++;
    } else {
      privateFeedbackCount++;
    }

    if (r.generations.length > 0) {
      responseCount++;
    }
  }

  const averageRating = totalReviews > 0 ? Number((totalRatingSum / totalReviews).toFixed(1)) : 0;
  const responseRate = totalReviews > 0 ? Math.round((responseCount / totalReviews) * 100) : 0;

  return {
    totalReviews,
    averageRating,
    ratingDistribution,
    sentimentCounts,
    googleTargetCount,
    privateFeedbackCount,
    responseCount,
    responseRate,
  };
}

/**
 * Get detailed review record with all generation drafts
 */
export async function getReviewDetails(
  ctx: TenantContext,
  reviewId: string
): Promise<ReviewFeedback & { generations: ReviewGeneration[] }> {
  requirePermission(ctx, 'REVIEWS_VIEW');

  const review = await prisma.reviewFeedback.findUnique({
    where: { id: reviewId },
    include: {
      branch: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      generations: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!review || review.businessId !== ctx.businessId) {
    throw new ReviewOperationError('Review record not found', 404);
  }

  return {
    id: review.id,
    businessId: review.businessId,
    branchId: review.branchId,
    branchName: review.branch?.name,
    customerId: review.customerId,
    customerName: review.customer?.name,
    customerPhone: review.customer?.phone,
    rating: review.rating,
    feedbackText: review.feedbackText,
    sentiment: review.sentiment as ReviewSentiment,
    isPublicGoogleReviewTarget: review.isPublicGoogleReviewTarget,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    generations: review.generations.map((g) => ({
      id: g.id,
      feedbackId: g.feedbackId,
      businessId: g.businessId,
      generatedEnglish: g.generatedEnglish,
      generatedHinglish: g.generatedHinglish,
      generatedHindi: g.generatedHindi,
      selectedVersion: g.selectedVersion as any,
      editedText: g.editedText,
      status: g.status,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
  };
}

/**
 * AI Review Assistant Draft Generator
 * Produces personalized English, Hinglish, and Hindi drafts.
 */
export async function generateReviewResponseDrafts(
  ctx: TenantContext,
  reviewId: string,
  _options: GenerateAiDraftPayload = {}
): Promise<ReviewGeneration> {
  requirePermission(ctx, 'REVIEWS_MANAGE');
  const review = await prisma.reviewFeedback.findUnique({
    where: { id: reviewId },
    include: {
      customer: { select: { name: true } },
      business: { select: { name: true } },
    },
  });

  if (!review || review.businessId !== ctx.businessId) {
    throw new ReviewOperationError('Review not found', 404);
  }

  await requireFeature(ctx, 'AI_REVIEW_ASSISTANT');
  await requireUsageLimit(ctx.businessId, 'monthlyAiDrafts');

  const customerName = review.customer?.name || 'Valued Customer';
  const businessName = review.business.name;
  const rating = review.rating;
  const feedback = review.feedbackText?.trim() || '';

  // Generate localized, contextual response drafts
  let generatedEnglish = '';
  let generatedHinglish = '';
  let generatedHindi = '';

  if (rating >= 4) {
    // Positive review response
    generatedEnglish = `Dear ${customerName},\n\nThank you so much for the glowing ${rating}-star rating! We are thrilled to hear you had such a wonderful time at ${businessName}${
      feedback ? ` and appreciated your note: "${feedback}"` : ''
    }. Our team puts heart into serving our regulars, and your support means the world to us. We look forward to welcoming you back soon!\n\nWarm regards,\nTeam ${businessName}`;

    generatedHinglish = `Namaste ${customerName} ji! 🙏\n\n${rating}-star review aur aapke pyaar ke liye dil se shukriya! ${businessName} mein aapka experience accha laga sunkar poori team bohot khush hai. Agli baar jab bhi aaiye, hum aapka din aur bhi behtar banane ki poori koshish karenge. Jaldi milte hain!\n\nBest wishes,\n${businessName}`;

    generatedHindi = `नमस्ते ${customerName} जी,\n\n${businessName} को ${rating} स्टार रेटिंग और अपनी सकारात्मक प्रतिक्रिया देने के लिए आपका बहुत-बहुत धन्यवाद। हमारी टीम हमेशा अपने ग्राहकों को सर्वोत्तम सेवा प्रदान करने के लिए तत्पर रहती है। हमें अत्यंत प्रसन्नता है कि आपका अनुभव सुखद रहा। हम जल्द ही आपका पुनः स्वागत करने के लिए उत्सुक हैं।\n\nसादर,\nटीम ${businessName}`;
  } else if (rating === 3) {
    // Neutral review response
    generatedEnglish = `Dear ${customerName},\n\nThank you for sharing your candid feedback with us. While we are glad you visited ${businessName}, we hold ourselves to a 5-star standard and regret that parts of your visit${
      feedback ? ` regarding "${feedback}"` : ''
    } fell short. We take your private comments seriously and are working with our staff to make continuous improvements. We hope to earn a full 5 stars on your next visit!\n\nSincerely,\nManagement, ${businessName}`;

    generatedHinglish = `Hello ${customerName} ji,\n\nFeedback share karne ke liye shukriya. ${businessName} mein aapka experience poori tarah perfect nahi raha, iska humein khed hai. Aapne jo suggestions diye hain un par hum kaam kar rahe hain taaki agli baar aapko 5-star service mile. Please humein ek aur mauka zaroor dein!\n\nRegards,\nTeam ${businessName}`;

    generatedHindi = `नमस्ते ${customerName} जी,\n\nआपके निष्पक्ष सुझाव के लिए धन्यवाद। हमें खेद है कि ${businessName} में आपका अनुभव पूर्णतः संतोषजनक नहीं रहा। आपकी प्रतिक्रिया हमारे लिए अमूल्य है और हम अपनी गुणवत्ता और सेवा में सुधार कर रहे हैं। आशा है कि अगली बार हम आपकी अपेक्षाओं पर पूरी तरह खरे उतरेंगे।\n\nसधन्यवाद,\nप्रबंधन, ${businessName}`;
  } else {
    // Negative review response
    generatedEnglish = `Dear ${customerName},\n\nThank you for bringing this to our attention. We sincerely apologize that your recent experience at ${businessName} did not meet expectations${
      feedback ? `, particularly regarding: "${feedback}"` : ''
    }. This is certainly not the standard of service we strive to deliver. We are personally investigating this matter with our management team to ensure it is addressed immediately. We value your relationship and would appreciate the opportunity to make things right on your next visit.\n\nRespectfully,\nManagement, ${businessName}`;

    generatedHinglish = `Dear ${customerName} ji,\n\nAapke is anubhav ke liye hum behad sharminda hain. ${businessName} mein har customer ka santosh hamari sabse badi priority hai, aur is baar humse chook hui. Humne is mamle ko seriously liya hai aur zaroori sudhaar shuru kar diye hain. Aapse nivedan hai ki humein apni galti sudharne ka ek avsar zaroor dein.\n\nWarm regards,\nManagement, ${businessName}`;

    generatedHindi = `नमस्ते ${customerName} जी,\n\nहमें अत्यंत खेद है कि ${businessName} में आपका अनुभव निराशाजनक रहा। यह हमारे सेवा मानकों के अनुरूप नहीं है। हमने आपकी इस शिकायत को गंभीरता से लिया है और उचित सुधारात्मक कदम उठाए जा रहे हैं। हम आपसे क्षमा चाहते हैं और आशा करते हैं कि आप हमें भविष्य में सेवा का एक और अवसर अवश्य देंगे।\n\nससम्मान,\nप्रबंधन, ${businessName}`;
  }

  // Create or update review generation draft
  const generation = await prisma.reviewGeneration.create({
    data: {
      feedbackId: review.id,
      businessId: ctx.businessId,
      generatedEnglish,
      generatedHinglish,
      generatedHindi,
      selectedVersion: 'ENGLISH',
      editedText: generatedEnglish,
      status: 'DRAFT',
      metadata: {
        customerName,
        rating,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  // Emits audit log for response generation
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId,
      actorUserId: ctx.user.id,
      action: 'REVIEW_RESPONSE_GENERATED',
      entityType: 'ReviewGeneration',
      entityId: generation.id,
      newState: {
        feedbackId: review.id,
        rating,
        status: 'DRAFT',
      },
    },
  });

  return {
    id: generation.id,
    feedbackId: generation.feedbackId,
    businessId: generation.businessId,
    generatedEnglish: generation.generatedEnglish,
    generatedHinglish: generation.generatedHinglish,
    generatedHindi: generation.generatedHindi,
    selectedVersion: generation.selectedVersion as any,
    editedText: generation.editedText,
    status: generation.status,
    createdAt: generation.createdAt.toISOString(),
    updatedAt: generation.updatedAt.toISOString(),
  };
}

/**
 * Update staff edits, approve draft, or mark copied to Google Profile
 */
export async function updateReviewGeneration(
  ctx: TenantContext,
  generationId: string,
  payload: UpdateGenerationPayload
): Promise<ReviewGeneration> {
  requirePermission(ctx, 'REVIEWS_MANAGE');

  const existing = await prisma.reviewGeneration.findUnique({
    where: { id: generationId },
  });

  if (!existing || existing.businessId !== ctx.businessId) {
    throw new ReviewOperationError('Generation draft not found', 404);
  }

  const updated = await prisma.reviewGeneration.update({
    where: { id: generationId },
    data: {
      ...(payload.selectedVersion ? { selectedVersion: payload.selectedVersion } : {}),
      ...(typeof payload.editedText === 'string' ? { editedText: payload.editedText } : {}),
      ...(payload.status ? { status: payload.status } : {}),
    },
  });

  // Emits audit log
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId,
      actorUserId: ctx.user.id,
      action:
        payload.status === 'COPIED_TO_GOOGLE'
          ? 'REVIEW_RESPONSE_COPIED'
          : 'REVIEW_RESPONSE_UPDATED',
      entityType: 'ReviewGeneration',
      entityId: updated.id,
      previousState: {
        status: existing.status,
        selectedVersion: existing.selectedVersion,
      },
      newState: {
        status: updated.status,
        selectedVersion: updated.selectedVersion,
      },
    },
  });

  return {
    id: updated.id,
    feedbackId: updated.feedbackId,
    businessId: updated.businessId,
    generatedEnglish: updated.generatedEnglish,
    generatedHinglish: updated.generatedHinglish,
    generatedHindi: updated.generatedHindi,
    selectedVersion: updated.selectedVersion as any,
    editedText: updated.editedText,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

// ============================================================================
// 7. CUSTOMER AI REVIEW SUGGESTION GENERATOR (PHASE 35)
// ============================================================================

export interface GenerateCustomerReviewSuggestionInput {
  businessName: string;
  category?: string | null;
  description?: string | null;
  rating: number;
  feedbackText?: string | null;
  language?: 'ENGLISH' | 'HINGLISH' | 'HINDI' | string;
}

export interface CustomerReviewSuggestions {
  english: string;
  hinglish: string;
  hindi: string;
  options: string[];
  allOptions: {
    english: string[];
    hinglish: string[];
    hindi: string[];
  };
}

function getCategoryNoun(category?: string | null): string {
  if (!category) return 'business';
  const c = category.toUpperCase().trim();
  switch (c) {
    case 'CAFE':
      return 'cafe';
    case 'RESTAURANT':
      return 'restaurant';
    case 'BAKERY':
      return 'bakery';
    case 'SALON':
      return 'salon';
    case 'BEAUTY':
      return 'beauty studio';
    case 'SPA':
      return 'spa';
    case 'GYM':
      return 'gym';
    case 'GAMEZONE':
      return 'game zone';
    case 'RETAIL':
      return 'store';
    default:
      return 'spot';
  }
}

function getCategoryNounHindi(category?: string | null): string {
  if (!category) return 'स्थान';
  const c = category.toUpperCase().trim();
  switch (c) {
    case 'CAFE':
      return 'कैफे';
    case 'RESTAURANT':
      return 'रेस्टोरेंट';
    case 'BAKERY':
      return 'बेकरी';
    case 'SALON':
      return 'सैलून';
    case 'BEAUTY':
      return 'ब्यूटी स्टूडियो';
    case 'SPA':
      return 'स्पा';
    case 'GYM':
      return 'जिम';
    case 'GAMEZONE':
      return 'गेमिंग ज़ोन';
    case 'RETAIL':
      return 'स्टोर';
    default:
      return 'स्थान';
  }
}

/**
 * Generates AI-assisted customer review draft suggestions (Phase 35).
 * Rules:
 * - Generates 3-5 distinct suggestions for English, Hinglish, and Hindi.
 * - Accurately represents the selected rating (1-5 stars).
 * - Incorporates dynamic business name, category, and description context.
 * - Never fabricates specific dishes, services, treatments, or purchases not provided by the customer.
 * - Customer can edit and customize the text before copying or submitting.
 * - Never hardcodes Cafe or Salon identifiers into the generation logic.
 */
export function generateCustomerReviewSuggestion(
  input: GenerateCustomerReviewSuggestionInput
): CustomerReviewSuggestions {
  const rating = Math.max(1, Math.min(5, Math.round(Number(input.rating) || 5)));
  const businessName = input.businessName?.trim() || 'this business';
  const catNoun = getCategoryNoun(input.category);
  const catNounHindi = getCategoryNounHindi(input.category);
  const customNote = input.feedbackText?.trim();
  const rawDesc = input.description?.trim();
  const cleanDesc = rawDesc && rawDesc.length > 0 && rawDesc.length < 80 ? rawDesc : null;
  const descSnippet = cleanDesc ? ` Their focus on ${cleanDesc.toLowerCase()} is evident throughout.` : '';
  const descHinglish = cleanDesc ? ` Inka focus on ${cleanDesc.toLowerCase()} clearly dikhta hai.` : '';
  const selectedLang = String(input.language || 'ENGLISH').toUpperCase();

  const allOptions: { english: string[]; hinglish: string[]; hindi: string[] } = {
    english: [],
    hinglish: [],
    hindi: [],
  };

  if (rating === 5) {
    allOptions.english = [
      `Had a fantastic 5-star experience at ${businessName}! The atmosphere is welcoming, service was prompt and courteous, and everything at this ${catNoun} exceeded expectations.${customNote ? ` Especially appreciated: "${customNote}".` : ''} Highly recommend to anyone!`,
      `Outstanding visit to ${businessName}! The staff was extraordinarily polite, the quality was top-notch, and the attention to detail was noticeable throughout.${descSnippet}${customNote ? ` Personal highlight: "${customNote}".` : ''} Will definitely be coming back regularly!`,
      `5/5 stars for ${businessName}! Clean environment, welcoming team, and exceptional service from start to finish.${customNote ? ` Note: "${customNote}".` : ''} Strongly recommend this ${catNoun}!`,
    ];
    allOptions.hinglish = [
      `${businessName} par mera visit sach mein bohot accha raha! 5-star service mili, staff kaafi polite aur supportive tha is ${catNoun} mein.${customNote ? ` Khas baat: "${customNote}".` : ''} Yahan regular aana definitely banta hai!`,
      `Bohot hi shandaar experience raha ${businessName} par! Quality aur atmosphere dono ekdum top class the.${descHinglish}${customNote ? ` Meri taraf se: "${customNote}".` : ''} Sabhi dosto ko strongly recommend karunga!`,
      `Full 5-star rating! ${businessName} ka staff aur hospitality dono dil jeet lene wale the.${customNote ? ` "${customNote}".` : ''} Definitely visiting this ${catNoun} again soon!`,
    ];
    allOptions.hindi = [
      `${businessName} में हमारा 5-स्टार अनुभव बहुत ही शानदार रहा! इस ${catNounHindi} का माहौल बहुत सुखद है, सेवा समय पर और अत्यंत विनम्र थी।${customNote ? ` विशेष रूप से: "${customNote}"।` : ''} सभी को यहाँ आने की पुरज़ोर अनुशंसा करते हैं!`,
      `${businessName} पर आकर बहुत ही अच्छा लगा! सेवा की गुणवत्ता और कर्मचारियों का सहयोग अत्यंत प्रशंसनीय था।${customNote ? ` विशेष टिप्पणी: "${customNote}"।` : ''} हम इस ${catNounHindi} में बार-बार आना पसंद करेंगे!`,
      `अत्यंत उत्कृष्ट और संतोषजनक अनुभव! ${businessName} की स्वच्छता, प्रबंध और आत्मीयता ने बहुत प्रभावित किया।${customNote ? ` "${customNote}"।` : ''} 5 में से 5 स्टार!`,
    ];
  } else if (rating === 4) {
    allOptions.english = [
      `Great overall visit to ${businessName}. Professional service, clean environment, and friendly staff at this ${catNoun}.${customNote ? ` Note: "${customNote}".` : ''} Looking forward to coming back again soon.`,
      `Really enjoyed my time at ${businessName}. Good service, pleasant vibe, and reliable quality overall.${descSnippet}${customNote ? ` Specifically appreciated: "${customNote}".` : ''} Solid 4 stars!`,
      `A very pleasant experience at ${businessName}. The staff handled everything well and the visit was smooth.${customNote ? ` Details: "${customNote}".` : ''} Would definitely recommend this ${catNoun}.`,
    ];
    allOptions.hinglish = [
      `${businessName} mein visit kaafi accha aur comfortable raha. Staff aur service dono badhiya the is ${catNoun} par.${customNote ? ` Mere hisaab se: "${customNote}".` : ''} Definitely recommended!`,
      `Overall bohot accha experience raha ${businessName} par. Service prompt thi aur staff friendly tha.${customNote ? ` "${customNote}".` : ''} Phir zaroor aayenge.`,
      `${businessName} par time spend karke accha laga. Quality aur mahaul dono satisfying the.${customNote ? ` Feedback: "${customNote}".` : ''} 4 stars well deserved!`,
    ];
    allOptions.hindi = [
      `${businessName} में हमारा अनुभव काफी अच्छा रहा। स्टाफ सहयोगी था और सेवा संतोषजनक थी।${customNote ? ` विशेष टिप्पणी: "${customNote}"।` : ''} हम इस ${catNounHindi} पर पुनः अवश्य आएंगे।`,
      `${businessName} की सेवा और व्यवस्था बहुत अच्छी लगी। माहौल सुखद और कर्मचारी मददगार थे।${customNote ? ` "${customNote}"।` : ''} अच्छा और सुखद अनुभव!`,
      `समग्र रूप से ${businessName} पर संतोषजनक यात्रा रही। गुणवत्ता उत्तम थी और प्रबंध व्यवस्थित था।${customNote ? ` टिप्पणी: "${customNote}"।` : ''}`,
    ];
  } else if (rating === 3) {
    allOptions.english = [
      `Average experience at ${businessName}. The visit was alright overall, though there is potential for improvement in service and speed at this ${catNoun}.${customNote ? ` Details: "${customNote}".` : ''}`,
      `Decent visit to ${businessName}. Some parts were good, but certain areas could be improved for a better customer experience.${customNote ? ` Note: "${customNote}".` : ''}`,
      `Mixed experience at ${businessName}. The core offering is fair, but attention to service could be improved.${customNote ? ` Observation: "${customNote}".` : ''}`,
    ];
    allOptions.hinglish = [
      `${businessName} par experience theek-thaak raha. Service theek thi lekin is ${catNoun} ko thoda aur behtar banaya ja sakta hai.${customNote ? ` Baat yeh hai: "${customNote}".` : ''}`,
      `Visit average raha ${businessName} par. Is ${catNoun} par service speed aur coordination mein improvement ki gunjaish hai.${customNote ? ` "${customNote}".` : ''}`,
      `${businessName} par overall okay experience raha. Thoda aur attention dene par experience kaafi behtar ho sakta hai.${customNote ? ` Details: "${customNote}".` : ''}`,
    ];
    allOptions.hindi = [
      `${businessName} में हमारा अनुभव सामान्य रहा। इस ${catNounHindi} में सेवा की गति और व्यवस्था में सुधार की गुंजाइश है।${customNote ? ` टिप्पणी: "${customNote}"।` : ''}`,
      `${businessName} पर औसत अनुभव रहा। कुछ बातें अच्छी थीं, किंतु इस ${catNounHindi} की सेवा और संचालन को और बेहतर बनाया जा सकता है।${customNote ? ` विवरण: "${customNote}"।` : ''}`,
      `मिला-जुला अनुभव। ${businessName} की मूल व्यवस्था ठीक थी, किंतु ग्राहकों पर थोड़ा और ध्यान देने की आवश्यकता है।${customNote ? ` "${customNote}"।` : ''}`,
    ];
  } else if (rating === 2) {
    allOptions.english = [
      `Visited ${businessName}, but unfortunately the experience was below expectations today at this ${catNoun}.${customNote ? ` Reason: "${customNote}".` : ''} Hope management addresses this soon.`,
      `Had an underwhelming experience at ${businessName}. The service fell short of what was expected.${customNote ? ` Details: "${customNote}".` : ''} Constructive feedback for the team to improve.`,
      `Disappointed with the visit to ${businessName}. There was noticeable delay and lack of attention from staff.${customNote ? ` Issue: "${customNote}".` : ''} Hope management takes customer feedback seriously.`,
    ];
    allOptions.hinglish = [
      `${businessName} par visit expect se thoda kamzor raha is ${catNoun} mein.${customNote ? ` Problem: "${customNote}".` : ''} Umeed hai management is par dhyaan dekar sudhaar karegi.`,
      `${businessName} par aaj ka experience thoda disappointing raha. Service quality aur responsiveness par dhyan dene ki zaroorat hai.${customNote ? ` "${customNote}".` : ''}`,
      `Umeed se kam raha ${businessName} par experience. Management se request hai ki staff aur service standards par dhyaan dein.${customNote ? ` Note: "${customNote}".` : ''}`,
    ];
    allOptions.hindi = [
      `${businessName} में हमारा अनुभव अपेक्षा से कम रहा। इस ${catNounHindi} के प्रबंधन से सुधार की अपेक्षा है।${customNote ? ` मुख्य कारण: "${customNote}"।` : ''}`,
      `${businessName} पर आज का अनुभव निराशाजनक रहा। सेवा में अपेक्षित तत्परता और सहयोग का अभाव था।${customNote ? ` विवरण: "${customNote}"।` : ''}`,
      `अपेक्षाओं के अनुरूप नहीं रहा। ${businessName} के प्रबंधन से निवेदन है कि सेवा और व्यवस्था में आवश्यक सुधार करें।${customNote ? ` "${customNote}"।` : ''}`,
    ];
  } else {
    allOptions.english = [
      `Disappointing visit to ${businessName}. The service did not meet expectations today at this ${catNoun}.${customNote ? ` Issues faced: "${customNote}".` : ''}`,
      `Very poor experience at ${businessName}. There were notable issues with service and customer care.${customNote ? ` Details: "${customNote}".` : ''} Needs prompt management attention.`,
      `Unsatisfactory experience at ${businessName}. Unresponsive service and inadequate quality during our visit.${customNote ? ` Feedback: "${customNote}".` : ''}`,
    ];
    allOptions.hinglish = [
      `${businessName} par experience kaafi disappointing raha is ${catNoun} mein.${customNote ? ` Dikkat: "${customNote}".` : ''} Service aur quality mein kaafi sudhaar ki zaroorat hai.`,
      `Bohot hi kharab experience raha ${businessName} par. Staff aur management dono ka response disappointing tha.${customNote ? ` "${customNote}".` : ''}`,
      `${businessName} par bilkul bhi accha nahi laga. Service aur management mein turant sudhaar hona chahiye.${customNote ? ` "${customNote}".` : ''}`,
    ];
    allOptions.hindi = [
      `${businessName} में आज का अनुभव निराशाजनक रहा। इस ${catNounHindi} की सेवा और व्यवस्था में ठोस सुधार की आवश्यकता है।${customNote ? ` समस्या: "${customNote}"।` : ''}`,
      `${businessName} पर बहुत ही असंतोषजनक अनुभव रहा। ग्राहकों के प्रति कोई उचित ध्यान या सेवा नहीं दी गई।${customNote ? ` विवरण: "${customNote}"।` : ''}`,
      `अत्यंत निराशाजनक यात्रा। ${businessName} की सेवा और व्यवस्था पूरी तरह से असंतोषजनक थी।${customNote ? ` "${customNote}"।` : ''}`,
    ];
  }

  const chosenOptions =
    selectedLang === 'HINDI'
      ? allOptions.hindi
      : selectedLang === 'HINGLISH'
      ? allOptions.hinglish
      : allOptions.english;

  return {
    english: allOptions.english[0],
    hinglish: allOptions.hinglish[0],
    hindi: allOptions.hindi[0],
    options: chosenOptions,
    allOptions,
  };
}

