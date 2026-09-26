export type ReviewSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export type GenerationStatus = 'DRAFT' | 'SELECTED' | 'COPIED_TO_GOOGLE' | 'ABANDONED';

export interface ReviewGeneration {
  id: string;
  feedbackId: string;
  businessId: string;
  generatedEnglish: string;
  generatedHinglish: string;
  generatedHindi: string;
  selectedVersion?: 'ENGLISH' | 'HINGLISH' | 'HINDI' | null;
  editedText?: string | null;
  status: GenerationStatus;
  metadata?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFeedback {
  id: string;
  businessId: string;
  branchId?: string | null;
  branchName?: string | null;
  customerId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  rating: number; // 1 to 5
  feedbackText?: string | null;
  sentiment?: ReviewSentiment | null;
  isPublicGoogleReviewTarget: boolean;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
  generations?: ReviewGeneration[];
  latestGeneration?: ReviewGeneration | null;
}

export interface ReviewMetrics {
  totalReviews: number;
  averageRating: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
  googleTargetCount: number;
  privateFeedbackCount: number;
  responseCount: number;
  responseRate: number; // 0 to 100%
}

export interface SubmitReviewPayload {
  rating: number; // 1-5
  feedbackText?: string;
  category?: string;
  branchId?: string;
}

export interface CustomerReviewState {
  hasReviewed: boolean;
  latestReview?: {
    id: string;
    rating: number;
    feedbackText?: string | null;
    isPublicGoogleReviewTarget: boolean;
    createdAt: string;
  } | null;
  googleReviewUrl?: string | null;
  businessName: string;
}

export interface GenerateAiDraftPayload {
  tone?: 'WARM' | 'PROFESSIONAL' | 'EMPATHETIC';
  includePromotion?: boolean;
}

export interface UpdateGenerationPayload {
  selectedVersion?: 'ENGLISH' | 'HINGLISH' | 'HINDI';
  editedText?: string;
  status?: GenerationStatus;
}
