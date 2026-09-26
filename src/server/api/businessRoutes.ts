import { Router, Response } from 'express';
import { TenantRequest } from './app';
import {
  getBusinessProfile,
  updateBusinessProfile,
  getBusinessDashboard,
  getOnboardingState,
  updateOnboardingState,
  getBusinessBranches,
  getBranchById,
  createBranch,
  updateBranch,
  getBusinessStaff,
  inviteOrAddStaff,
  updateStaffMembership,
  getBusinessBranding,
  updateBusinessBranding,
  getBusinessRoles,
} from '../services/businessService';
import {
  getBusinessLoyaltyProgram,
  upsertLoyaltyProgram,
  setLoyaltyProgramStatus,
  awardStamps,
  awardPoints,
  adjustLoyaltyBalance,
  getBusinessLoyaltyHistory,
  searchLoyaltyCustomers,
} from '../services/loyaltyService';
import {
  getBusinessRewards,
  createReward,
  updateReward,
  setRewardStatus,
  getBusinessRedemptions,
  staffLookupRedemption,
  staffValidateRedemption,
} from '../services/rewardService';
import {
  getBusinessCustomers,
  getCustomer360,
  updateCustomerProfile,
  getCustomerTimeline,
  getCustomerNotes,
  createCustomerNote,
  updateCustomerNote,
  deleteCustomerNote,
  getBusinessTags,
  createBusinessTag,
  updateBusinessTag,
  deleteBusinessTag,
  assignCustomerTag,
  removeCustomerTag,
  getBusinessSegments,
  createBusinessSegment,
  updateBusinessSegment,
  deleteBusinessSegment,
  getSegmentCustomers,
} from '../services/crmService';
import { createCustomer } from '../services/customerService';
import {
  getCatalogOverview,
  getBusinessMenus,
  createMenu,
  updateMenu,
  archiveMenu,
  createMenuCategory,
  updateMenuCategory,
  reorderMenuCategories,
  deleteMenuCategory,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  getBusinessServices,
  createServiceCategory,
  updateServiceCategory,
  reorderServiceCategories,
  deleteServiceCategory,
  createService,
  updateService,
  toggleServiceAvailability,
  deleteService,
  getBusinessProducts,
  createProductCategory,
  updateProductCategory,
  reorderProductCategories,
  deleteProductCategory,
  createProduct,
  updateProduct,
  toggleProductAvailability,
  deleteProduct,
} from '../services/catalogService';
import {
  getBusinessOffers,
  getOfferById,
  createOffer,
  updateOffer,
  setOfferStatus,
  deleteOffer,
  getBusinessOfferRedemptions,
  validateOfferForCustomer,
  redeemOffer,
} from '../services/offerService';
import {
  getBusinessReviews,
  getBusinessReviewMetrics,
  getReviewDetails,
  generateReviewResponseDrafts,
  updateReviewGeneration,
  ReviewOperationError,
} from '../services/reviewService';
import {
  getAnalyticsOverview,
  getCustomerAnalytics,
  getRetentionAnalytics,
  getLoyaltyAnalytics,
  getRewardsAnalytics,
  getOffersAnalytics,
  getReviewAnalytics,
  getBranchAnalytics,
  exportAnalyticsCsv,
  AnalyticsOperationError,
} from '../services/analyticsService';
import { ExportType } from '../../types/analytics';
import {
  getBusinessBillingOverview,
  changePlan,
  cancelSubscription,
  resumeSubscription,
  getInvoices,
  getPayments,
} from '../services/billingService';
import {
  getUsageAndLimits,
  FeatureNotIncludedError,
  UsageLimitExceededError,
} from '../services/entitlementService';
import { exportRateLimiter, aiReviewGenerationLimiter } from '../auth/rateLimiter';

export const businessRouter = Router();

// ============================================================================
// 1. Business Profile & General Configuration
// ============================================================================

// GET /api/business or /api/business/profile
businessRouter.get(['/', '/profile'], async (req: TenantRequest, res: Response) => {
  try {
    const profile = await getBusinessProfile(req.tenantContext!);
    res.json(profile);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' || err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PUT /api/business or /api/business/profile
const handleUpdateProfile = async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateBusinessProfile(req.tenantContext!, req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' || err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
};

businessRouter.put(['/', '/profile'], handleUpdateProfile);
businessRouter.patch(['/', '/profile'], handleUpdateProfile);

// GET /api/business/dashboard
businessRouter.get('/dashboard', async (req: TenantRequest, res: Response) => {
  try {
    const dashboard = await getBusinessDashboard(req.tenantContext!);
    res.json(dashboard);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' || err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ============================================================================
// 2. Onboarding Lifecycle
// ============================================================================

// GET /api/business/onboarding
businessRouter.get('/onboarding', async (req: TenantRequest, res: Response) => {
  try {
    const onboarding = await getOnboardingState(req.tenantContext!);
    res.json(onboarding);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' || err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PUT / PATCH / POST /api/business/onboarding
const handleUpdateOnboarding = async (req: TenantRequest, res: Response) => {
  try {
    const step = Number(req.body.step || 1);
    const completed = req.body.completed !== undefined ? Boolean(req.body.completed) : undefined;
    const updated = await updateOnboardingState(req.tenantContext!, step, completed);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
};

businessRouter.post('/onboarding', handleUpdateOnboarding);
businessRouter.put('/onboarding', handleUpdateOnboarding);
businessRouter.patch('/onboarding', handleUpdateOnboarding);

// ============================================================================
// 3. Branch Management
// ============================================================================

// GET /api/business/branches
businessRouter.get('/branches', async (req: TenantRequest, res: Response) => {
  try {
    const branches = await getBusinessBranches(req.tenantContext!);
    res.json(branches);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/business/branches
businessRouter.post('/branches', async (req: TenantRequest, res: Response) => {
  try {
    const branch = await createBranch(req.tenantContext!, req.body);
    res.status(201).json(branch);
  } catch (err: any) {
    const isEntitlement = err.name === 'FeatureNotIncludedError' || err.code === 'FEATURE_NOT_INCLUDED' || err.name === 'UsageLimitExceededError' || err.code === 'LIMIT_EXCEEDED';
    const status = isEntitlement || err.name === 'PermissionDeniedError' ? 403 : err.name === 'TenantAuthorizationError' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// GET /api/business/branches/:id
businessRouter.get('/branches/:id', async (req: TenantRequest, res: Response) => {
  try {
    const branch = await getBranchById(req.tenantContext!, String(req.params.id));
    if (!branch) {
      res.status(404).json({ error: 'Branch not found in this business tenant', code: 'NOT_FOUND' });
      return;
    }
    res.json(branch);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PUT / PATCH /api/business/branches/:id
const handleUpdateBranch = async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateBranch(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : 'NOT_FOUND' });
  }
};

businessRouter.put('/branches/:id', handleUpdateBranch);
businessRouter.patch('/branches/:id', handleUpdateBranch);

// ============================================================================
// 4. Staff Management & Roles
// ============================================================================

// GET /api/business/staff
businessRouter.get('/staff', async (req: TenantRequest, res: Response) => {
  try {
    const staff = await getBusinessStaff(req.tenantContext!);
    res.json(staff);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// POST /api/business/staff
businessRouter.post('/staff', async (req: TenantRequest, res: Response) => {
  try {
    const membership = await inviteOrAddStaff(req.tenantContext!, req.body);
    res.status(201).json(membership);
  } catch (err: any) {
    const isEntitlement = err.name === 'FeatureNotIncludedError' || err.code === 'FEATURE_NOT_INCLUDED' || err.name === 'UsageLimitExceededError' || err.code === 'LIMIT_EXCEEDED';
    const status = isEntitlement || err.name === 'PermissionDeniedError' ? 403 : err.name === 'TenantAuthorizationError' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// PUT / PATCH /api/business/staff/:membershipId
const handleUpdateStaff = async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateStaffMembership(req.tenantContext!, String(req.params.membershipId), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
};

businessRouter.put('/staff/:membershipId', handleUpdateStaff);
businessRouter.patch('/staff/:membershipId', handleUpdateStaff);

// GET /api/business/roles
businessRouter.get('/roles', async (req: TenantRequest, res: Response) => {
  try {
    const roles = await getBusinessRoles(req.tenantContext!);
    res.json(roles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 5. Business Branding & Theme Presets
// ============================================================================

// GET /api/business/branding
businessRouter.get('/branding', async (req: TenantRequest, res: Response) => {
  try {
    const branding = await getBusinessBranding(req.tenantContext!);
    res.json(branding);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' || err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

// PUT / PATCH /api/business/branding
const handleUpdateBranding = async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateBusinessBranding(req.tenantContext!, req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' || err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
};

businessRouter.put('/branding', handleUpdateBranding);
businessRouter.patch('/branding', handleUpdateBranding);

// ============================================================================
// 6. Loyalty Program & Counter Staff Awarding Terminal
// ============================================================================

// GET /api/business/loyalty or /api/business/loyalty/program
businessRouter.get(['/loyalty', '/loyalty/program'], async (req: TenantRequest, res: Response) => {
  try {
    const data = await getBusinessLoyaltyProgram(req.tenantContext!);
    res.json(data);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// POST /api/business/loyalty/program
businessRouter.post('/loyalty/program', async (req: TenantRequest, res: Response) => {
  try {
    const program = await upsertLoyaltyProgram(req.tenantContext!, req.body);
    res.status(201).json(program);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// PATCH /api/business/loyalty/program/:id/status
businessRouter.patch('/loyalty/program/:id/status', async (req: TenantRequest, res: Response) => {
  try {
    const { status } = req.body;
    const program = await setLoyaltyProgramStatus(req.tenantContext!, String(req.params.id), status);
    res.json(program);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// POST /api/business/loyalty/award-stamp
businessRouter.post('/loyalty/award-stamp', async (req: TenantRequest, res: Response) => {
  try {
    const card = await awardStamps(req.tenantContext!, req.body);
    res.json({ success: true, card });
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// POST /api/business/loyalty/award-points
businessRouter.post('/loyalty/award-points', async (req: TenantRequest, res: Response) => {
  try {
    const card = await awardPoints(req.tenantContext!, req.body);
    res.json({ success: true, card });
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// POST /api/business/loyalty/adjust
businessRouter.post('/loyalty/adjust', async (req: TenantRequest, res: Response) => {
  try {
    const card = await adjustLoyaltyBalance(req.tenantContext!, req.body);
    res.json({ success: true, card });
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// GET /api/business/loyalty/history
businessRouter.get('/loyalty/history', async (req: TenantRequest, res: Response) => {
  try {
    const history = await getBusinessLoyaltyHistory(req.tenantContext!, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      type: typeof req.query.type === 'string' ? (req.query.type as any) : undefined,
      branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
      customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
    });
    res.json(history);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// GET /api/business/loyalty/customers (Search customers for staff awarding terminal)
businessRouter.get('/loyalty/customers', async (req: TenantRequest, res: Response) => {
  try {
    const query = typeof req.query.search === 'string' ? req.query.search : undefined;
    const customers = await searchLoyaltyCustomers(req.tenantContext!, query);
    res.json(customers);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// ============================================================================
// 7. Rewards Catalog & Staff Redemption Terminal
// ============================================================================

// GET /api/business/rewards
businessRouter.get('/rewards', async (req: TenantRequest, res: Response) => {
  try {
    const data = await getBusinessRewards(req.tenantContext!);
    res.json(data);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// POST /api/business/rewards
businessRouter.post('/rewards', async (req: TenantRequest, res: Response) => {
  try {
    const reward = await createReward(req.tenantContext!, req.body);
    res.status(201).json(reward);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// PUT / PATCH /api/business/rewards/:id
const handleUpdateReward = async (req: TenantRequest, res: Response) => {
  try {
    const reward = await updateReward(req.tenantContext!, String(req.params.id), req.body);
    res.json(reward);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'REWARD_NOT_FOUND' || err.code === 'NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
};
businessRouter.put('/rewards/:id', handleUpdateReward);
businessRouter.patch('/rewards/:id', handleUpdateReward);

// PATCH /api/business/rewards/:id/status
businessRouter.patch('/rewards/:id/status', async (req: TenantRequest, res: Response) => {
  try {
    const statusVal = req.body.status;
    const reward = await setRewardStatus(req.tenantContext!, String(req.params.id), statusVal);
    res.json(reward);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// GET /api/business/redemptions (Ledger)
businessRouter.get('/redemptions', async (req: TenantRequest, res: Response) => {
  try {
    const data = await getBusinessRedemptions(req.tenantContext!, {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      status: typeof req.query.status === 'string' ? (req.query.status as any) : undefined,
      branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
      rewardId: typeof req.query.rewardId === 'string' ? req.query.rewardId : undefined,
      customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
      endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    });
    res.json(data);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// GET /api/business/redemptions/lookup/:code (Staff preview)
businessRouter.get('/redemptions/lookup/:code', async (req: TenantRequest, res: Response) => {
  try {
    const data = await staffLookupRedemption(req.tenantContext!, String(req.params.code));
    res.json(data);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : err.code === 'REDEMPTION_NOT_FOUND'
        ? 404
        : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// POST /api/business/redemptions/validate (Staff redeem execution)
businessRouter.post('/redemptions/validate', async (req: TenantRequest, res: Response) => {
  try {
    const { code, branchId } = req.body;
    const redeemed = await staffValidateRedemption(req.tenantContext!, code, { branchId });
    res.json({ success: true, redemption: redeemed });
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : err.code === 'REDEMPTION_NOT_FOUND'
        ? 404
        : err.code === 'ALREADY_REDEEMED' || err.code === 'REDEMPTION_EXPIRED'
        ? 409
        : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : err.code });
  }
});

// ============================================================================
// 7. Customer CRM + Directory + Timeline + Notes + Tags + Segments
// ============================================================================

// GET /api/business/customers — Query directory (search, filter, sort, paginate)
businessRouter.get('/customers', async (req: TenantRequest, res: Response) => {
  try {
    const data = await getBusinessCustomers(req.tenantContext!, {
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      status: typeof req.query.status === 'string' ? (req.query.status as any) : undefined,
      branchId: typeof req.query.branchId === 'string' ? req.query.branchId : undefined,
      tagId: typeof req.query.tagId === 'string' ? req.query.tagId : undefined,
      segmentId: typeof req.query.segmentId === 'string' ? req.query.segmentId : undefined,
      sortBy: typeof req.query.sortBy === 'string' ? (req.query.sortBy as any) : undefined,
      sortOrder: typeof req.query.sortOrder === 'string' ? (req.query.sortOrder as any) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(data);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// POST /api/business/customers — Register new customer for business
businessRouter.post('/customers', async (req: TenantRequest, res: Response) => {
  try {
    const customer = await createCustomer(req.tenantContext!, req.body);
    res.status(201).json(customer);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// GET /api/business/customers/:id — Customer 360 profile
businessRouter.get('/customers/:id', async (req: TenantRequest, res: Response) => {
  try {
    const data = await getCustomer360(req.tenantContext!, String(req.params.id));
    res.json(data);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 500;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// PUT /api/business/customers/:id — Update customer profile
const handleUpdateCustomer = async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateCustomerProfile(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
};
businessRouter.put('/customers/:id', handleUpdateCustomer);
businessRouter.patch('/customers/:id', handleUpdateCustomer);

// GET /api/business/customers/:id/timeline — Unified chronological activity timeline
businessRouter.get('/customers/:id/timeline', async (req: TenantRequest, res: Response) => {
  try {
    const data = await getCustomerTimeline(req.tenantContext!, String(req.params.id), {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      typeFilter: typeof req.query.typeFilter === 'string' ? req.query.typeFilter : undefined,
    });
    res.json(data);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 500;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// GET /api/business/customers/:id/notes — List customer notes
businessRouter.get('/customers/:id/notes', async (req: TenantRequest, res: Response) => {
  try {
    const notes = await getCustomerNotes(req.tenantContext!, String(req.params.id));
    res.json(notes);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 500;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// POST /api/business/customers/:id/notes — Create customer note
businessRouter.post('/customers/:id/notes', async (req: TenantRequest, res: Response) => {
  try {
    const note = await createCustomerNote(req.tenantContext!, String(req.params.id), req.body.content);
    res.status(201).json(note);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// PUT /api/business/customers/:id/notes/:noteId — Update customer note
businessRouter.put('/customers/:id/notes/:noteId', async (req: TenantRequest, res: Response) => {
  try {
    const note = await updateCustomerNote(req.tenantContext!, String(req.params.id), String(req.params.noteId), req.body.content);
    res.json(note);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'NOTE_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// DELETE /api/business/customers/:id/notes/:noteId — Delete customer note
businessRouter.delete('/customers/:id/notes/:noteId', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteCustomerNote(req.tenantContext!, String(req.params.id), String(req.params.noteId));
    res.json(result);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'NOTE_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// POST /api/business/customers/:id/tags — Assign tag to customer
businessRouter.post('/customers/:id/tags', async (req: TenantRequest, res: Response) => {
  try {
    const result = await assignCustomerTag(req.tenantContext!, String(req.params.id), String(req.body.tagId));
    res.json(result);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND' || err.code === 'TAG_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// DELETE /api/business/customers/:id/tags/:tagId — Remove tag from customer
businessRouter.delete('/customers/:id/tags/:tagId', async (req: TenantRequest, res: Response) => {
  try {
    const result = await removeCustomerTag(req.tenantContext!, String(req.params.id), String(req.params.tagId));
    res.json(result);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'CUSTOMER_NOT_FOUND' || err.code === 'TAG_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// GET /api/business/customer-tags — List business tags
businessRouter.get('/customer-tags', async (req: TenantRequest, res: Response) => {
  try {
    const tags = await getBusinessTags(req.tenantContext!);
    res.json(tags);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// POST /api/business/customer-tags — Create business tag
businessRouter.post('/customer-tags', async (req: TenantRequest, res: Response) => {
  try {
    const tag = await createBusinessTag(req.tenantContext!, req.body);
    res.status(201).json(tag);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : err.code === 'TAG_ALREADY_EXISTS'
        ? 409
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// PUT /api/business/customer-tags/:id — Update business tag
businessRouter.put('/customer-tags/:id', async (req: TenantRequest, res: Response) => {
  try {
    const tag = await updateBusinessTag(req.tenantContext!, String(req.params.id), req.body);
    res.json(tag);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'TAG_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// DELETE /api/business/customer-tags/:id — Delete business tag
businessRouter.delete('/customer-tags/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteBusinessTag(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'TAG_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// GET /api/business/customer-segments — List business customer segments
businessRouter.get('/customer-segments', async (req: TenantRequest, res: Response) => {
  try {
    const segments = await getBusinessSegments(req.tenantContext!);
    res.json(segments);
  } catch (err: any) {
    const status = err.name === 'TenantAuthorizationError' ? 404 : err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined });
  }
});

// POST /api/business/customer-segments — Create customer segment
businessRouter.post('/customer-segments', async (req: TenantRequest, res: Response) => {
  try {
    const segment = await createBusinessSegment(req.tenantContext!, req.body);
    res.status(201).json(segment);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// PUT /api/business/customer-segments/:id — Update customer segment
businessRouter.put('/customer-segments/:id', async (req: TenantRequest, res: Response) => {
  try {
    const segment = await updateBusinessSegment(req.tenantContext!, String(req.params.id), req.body);
    res.json(segment);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'SEGMENT_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// DELETE /api/business/customer-segments/:id — Delete customer segment
businessRouter.delete('/customer-segments/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteBusinessSegment(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'SEGMENT_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// GET /api/business/customer-segments/:id/customers — List customers matching segment
businessRouter.get('/customer-segments/:id/customers', async (req: TenantRequest, res: Response) => {
  try {
    const data = await getSegmentCustomers(req.tenantContext!, String(req.params.id), {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(data);
  } catch (err: any) {
    const status =
      err.name === 'TenantAuthorizationError' || err.code === 'SEGMENT_NOT_FOUND'
        ? 404
        : err.name === 'PermissionDeniedError'
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code || (err.name === 'PermissionDeniedError' ? 'FORBIDDEN_PERMISSION' : undefined) });
  }
});

// ============================================================================
// 10. CATALOG MANAGEMENT (MENU, SERVICES, PRODUCTS)
// ============================================================================

// GET /api/business/catalog/overview
businessRouter.get('/catalog/overview', async (req: TenantRequest, res: Response) => {
  try {
    const overview = await getCatalogOverview(req.tenantContext!);
    res.json(overview);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// --- MENUS ---
businessRouter.get('/catalog/menus', async (req: TenantRequest, res: Response) => {
  try {
    const menus = await getBusinessMenus(req.tenantContext!);
    res.json(menus);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post('/catalog/menus', async (req: TenantRequest, res: Response) => {
  try {
    const menu = await createMenu(req.tenantContext!, req.body);
    res.status(201).json(menu);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/menus/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateMenu(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/menus/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await archiveMenu(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// --- MENU CATEGORIES ---
businessRouter.post('/catalog/menus/:menuId/categories', async (req: TenantRequest, res: Response) => {
  try {
    const category = await createMenuCategory(req.tenantContext!, String(req.params.menuId), req.body);
    res.status(201).json(category);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/menus/categories/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateMenuCategory(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/menus/categories/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteMenuCategory(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post('/catalog/menus/:menuId/categories/reorder', async (req: TenantRequest, res: Response) => {
  try {
    const reordered = await reorderMenuCategories(req.tenantContext!, String(req.params.menuId), req.body.categoryIds || []);
    res.json(reordered);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// --- MENU ITEMS ---
businessRouter.post('/catalog/menus/categories/:categoryId/items', async (req: TenantRequest, res: Response) => {
  try {
    const item = await createMenuItem(req.tenantContext!, String(req.params.categoryId), req.body);
    res.status(201).json(item);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/menus/items/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateMenuItem(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.patch('/catalog/menus/items/:id/availability', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await toggleMenuItemAvailability(req.tenantContext!, String(req.params.id), Boolean(req.body.isAvailable));
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/menus/items/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteMenuItem(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// --- SERVICES ---
businessRouter.get('/catalog/services', async (req: TenantRequest, res: Response) => {
  try {
    const services = await getBusinessServices(req.tenantContext!, {
      search: req.query.search ? String(req.query.search) : undefined,
      categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
      isAvailable: req.query.isAvailable !== undefined ? req.query.isAvailable === 'true' : undefined,
    });
    res.json(services);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post('/catalog/services/categories', async (req: TenantRequest, res: Response) => {
  try {
    const category = await createServiceCategory(req.tenantContext!, req.body);
    res.status(201).json(category);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/services/categories/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateServiceCategory(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/services/categories/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteServiceCategory(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post(['/catalog/service-categories/reorder', '/catalog/services/categories/reorder'], async (req: TenantRequest, res: Response) => {
  try {
    const categoryIds = req.body.categoryIds || req.body.orderedCategoryIds || [];
    const reordered = await reorderServiceCategories(req.tenantContext!, categoryIds);
    res.json(reordered);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post('/catalog/services/categories/:categoryId/items', async (req: TenantRequest, res: Response) => {
  try {
    const service = await createService(req.tenantContext!, String(req.params.categoryId), req.body);
    res.status(201).json(service);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/services/items/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateService(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.patch('/catalog/services/items/:id/availability', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await toggleServiceAvailability(req.tenantContext!, String(req.params.id), Boolean(req.body.isAvailable));
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/services/items/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteService(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// --- PRODUCTS ---
businessRouter.get('/catalog/products', async (req: TenantRequest, res: Response) => {
  try {
    const products = await getBusinessProducts(req.tenantContext!, {
      search: req.query.search ? String(req.query.search) : undefined,
      categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
      isAvailable: req.query.isAvailable !== undefined ? req.query.isAvailable === 'true' : undefined,
    });
    res.json(products);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post('/catalog/products/categories', async (req: TenantRequest, res: Response) => {
  try {
    const category = await createProductCategory(req.tenantContext!, req.body);
    res.status(201).json(category);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/products/categories/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateProductCategory(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/products/categories/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteProductCategory(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post(['/catalog/product-categories/reorder', '/catalog/products/categories/reorder'], async (req: TenantRequest, res: Response) => {
  try {
    const categoryIds = req.body.categoryIds || req.body.orderedCategoryIds || [];
    const reordered = await reorderProductCategories(req.tenantContext!, categoryIds);
    res.json(reordered);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.post('/catalog/products/categories/:categoryId/items', async (req: TenantRequest, res: Response) => {
  try {
    const product = await createProduct(req.tenantContext!, String(req.params.categoryId), req.body);
    res.status(201).json(product);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.put('/catalog/products/items/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateProduct(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.patch('/catalog/products/items/:id/availability', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await toggleProductAvailability(req.tenantContext!, String(req.params.id), Boolean(req.body.isAvailable));
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

businessRouter.delete('/catalog/products/items/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteProduct(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// ============================================================================
// 12. Offers & Promotions Engine
// ============================================================================

// GET /api/business/offers
businessRouter.get('/offers', async (req: TenantRequest, res: Response) => {
  try {
    const offers = await getBusinessOffers(req.tenantContext!, {
      status: req.query.status as string,
      branchId: req.query.branchId as string,
      search: req.query.search as string,
    });
    res.json(offers);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// POST /api/business/offers
businessRouter.post('/offers', async (req: TenantRequest, res: Response) => {
  try {
    const offer = await createOffer(req.tenantContext!, req.body);
    res.status(201).json(offer);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'VALIDATION_ERROR' ? 400 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// GET /api/business/offers/redemptions
businessRouter.get('/offers/redemptions', async (req: TenantRequest, res: Response) => {
  try {
    const result = await getBusinessOfferRedemptions(req.tenantContext!, {
      offerId: req.query.offerId as string,
      customerId: req.query.customerId as string,
      branchId: req.query.branchId as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// POST /api/business/offers/validate
businessRouter.post('/offers/validate', async (req: TenantRequest, res: Response) => {
  try {
    const validation = await validateOfferForCustomer(req.tenantContext!, req.body);
    res.json(validation);
  } catch (err: any) {
    const status =
      err.name === 'PermissionDeniedError'
        ? 403
        : err.code === 'NOT_FOUND'
        ? 404
        : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// POST /api/business/offers/redeem
businessRouter.post('/offers/redeem', async (req: TenantRequest, res: Response) => {
  try {
    const redemption = await redeemOffer(req.tenantContext!, req.body);
    res.status(201).json({ success: true, redemption });
  } catch (err: any) {
    const status =
      err.name === 'PermissionDeniedError'
        ? 403
        : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'OFFER_CUSTOMER_LIMIT_REACHED' || err.code === 'OFFER_TOTAL_LIMIT_REACHED'
        ? 409
        : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// GET /api/business/offers/:id
businessRouter.get('/offers/:id', async (req: TenantRequest, res: Response) => {
  try {
    const offer = await getOfferById(req.tenantContext!, String(req.params.id));
    res.json(offer);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PUT /api/business/offers/:id
businessRouter.put('/offers/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateOffer(req.tenantContext!, String(req.params.id), req.body);
    res.json(updated);
  } catch (err: any) {
    const status =
      err.name === 'PermissionDeniedError'
        ? 403
        : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'VALIDATION_ERROR'
        ? 400
        : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PATCH /api/business/offers/:id/status
businessRouter.patch('/offers/:id/status', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await setOfferStatus(req.tenantContext!, String(req.params.id), req.body.status);
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// DELETE /api/business/offers/:id
businessRouter.delete('/offers/:id', async (req: TenantRequest, res: Response) => {
  try {
    const result = await deleteOffer(req.tenantContext!, String(req.params.id));
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' ? 403 : err.code === 'NOT_FOUND' ? 404 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// ============================================================================
// 12. Reviews & AI Reputation Engine (Phase 13)
// ============================================================================

// GET /api/business/reviews/metrics — Reputation overview aggregates
businessRouter.get('/reviews/metrics', async (req: TenantRequest, res: Response) => {
  try {
    const metrics = await getBusinessReviewMetrics(req.tenantContext!);
    res.json(metrics);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' || err.statusCode === 403 ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// GET /api/business/reviews — Paginated list with filters and search
businessRouter.get('/reviews', async (req: TenantRequest, res: Response) => {
  try {
    const { page, limit, rating, sentiment, isPublicGoogleReviewTarget, branchId, status, search } = req.query;
    const result = await getBusinessReviews(req.tenantContext!, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      rating: rating ? Number(rating) : undefined,
      sentiment: sentiment ? (String(sentiment) as any) : undefined,
      isPublicGoogleReviewTarget:
        typeof isPublicGoogleReviewTarget === 'string'
          ? isPublicGoogleReviewTarget === 'true'
          : undefined,
      branchId: branchId ? String(branchId) : undefined,
      status: status ? (String(status) as any) : undefined,
      search: search ? String(search) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' || err.statusCode === 403 ? 403 : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// GET /api/business/reviews/:id — Review details with generation drafts
businessRouter.get('/reviews/:id', async (req: TenantRequest, res: Response) => {
  try {
    const review = await getReviewDetails(req.tenantContext!, String(req.params.id));
    res.json(review);
  } catch (err: any) {
    const status =
      err instanceof ReviewOperationError
        ? err.statusCode
        : err.name === 'PermissionDeniedError' || err.statusCode === 403
        ? 403
        : 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// POST /api/business/reviews/:id/generate-ai — AI Review Assistant Draft Generator
businessRouter.post('/reviews/:id/generate-ai', async (req: TenantRequest, res: Response) => {
  try {
    const rateCheck = aiReviewGenerationLimiter.consume(`${req.tenantContext!.businessId}:${req.tenantContext!.user.id}`);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `AI generation rate limit exceeded. Please wait ${rateCheck.retryAfterSeconds}s before generating more drafts.`,
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    const generation = await generateReviewResponseDrafts(
      req.tenantContext!,
      String(req.params.id),
      req.body
    );
    res.status(201).json(generation);
  } catch (err: any) {
    const status =
      err instanceof ReviewOperationError
        ? err.statusCode
        : err.name === 'PermissionDeniedError' || err.statusCode === 403
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// PATCH /api/business/reviews/generations/:id — Update staff edits / approve / mark copied
businessRouter.patch('/reviews/generations/:id', async (req: TenantRequest, res: Response) => {
  try {
    const updated = await updateReviewGeneration(
      req.tenantContext!,
      String(req.params.id),
      req.body
    );
    res.json(updated);
  } catch (err: any) {
    const status =
      err instanceof ReviewOperationError
        ? err.statusCode
        : err.name === 'PermissionDeniedError' || err.statusCode === 403
        ? 403
        : 400;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

// ============================================================================
// 14. Analytics & Business Intelligence Engine
// ============================================================================

const parseAnalyticsQuery = (req: TenantRequest) => {
  const { preset, startDate, endDate, branchId, compare } = req.query;
  return {
    preset: preset ? (String(preset) as any) : undefined,
    startDate: startDate ? String(startDate) : undefined,
    endDate: endDate ? String(endDate) : undefined,
    branchId: branchId ? String(branchId) : undefined,
    compare: compare === 'false' ? false : true,
  };
};

const handleAnalyticsError = (err: any, res: Response) => {
  if (err.name === 'FeatureNotIncludedError' || err.code === 'FEATURE_NOT_INCLUDED') {
    return res.status(403).json({ error: err.message, code: 'FEATURE_NOT_INCLUDED', featureKey: err.featureKey });
  }
  const status =
    err instanceof AnalyticsOperationError
      ? err.statusCode
      : err.name === 'PermissionDeniedError' || err.statusCode === 403
      ? 403
      : 500;
  res.status(status).json({ error: err.message, code: err.code });
};

// GET /api/business/analytics/overview
businessRouter.get('/analytics/overview', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getAnalyticsOverview(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/customers
businessRouter.get('/analytics/customers', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getCustomerAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/retention
businessRouter.get('/analytics/retention', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getRetentionAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/loyalty
businessRouter.get('/analytics/loyalty', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getLoyaltyAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/rewards
businessRouter.get('/analytics/rewards', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getRewardsAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/offers
businessRouter.get('/analytics/offers', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getOffersAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/reviews
businessRouter.get('/analytics/reviews', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getReviewAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/branches
businessRouter.get('/analytics/branches', async (req: TenantRequest, res: Response) => {
  try {
    const query = parseAnalyticsQuery(req);
    const data = await getBranchAnalytics(req.tenantContext!, query);
    res.json(data);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// GET /api/business/analytics/export
businessRouter.get('/analytics/export', async (req: TenantRequest, res: Response) => {
  try {
    const rateCheck = exportRateLimiter.consume(req.tenantContext!.businessId);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Export rate limit exceeded. Please wait ${rateCheck.retryAfterSeconds}s before exporting again.`,
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    const { preset, startDate, endDate, branchId, type } = req.query;
    const allowedTypes: ExportType[] = ['overview', 'customers', 'loyalty', 'reviews'];
    const exportType: ExportType = allowedTypes.includes(String(type) as ExportType)
      ? (String(type) as ExportType)
      : 'overview';

    const csv = await exportAnalyticsCsv(
      req.tenantContext!,
      {
        preset: preset as any,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        branchId: branchId ? String(branchId) : undefined,
      },
      exportType
    );
    const safeType = encodeURIComponent(exportType);
    const filename = `analytics-${safeType}-${Date.now()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err: any) {
    handleAnalyticsError(err, res);
  }
});

// ============================================================================
// 12. BILLING & SUBSCRIPTIONS
// ============================================================================

const handleBillingError = (err: any, res: Response) => {
  if (err instanceof FeatureNotIncludedError || err.code === 'FEATURE_NOT_INCLUDED') {
    return res.status(403).json({
      error: err.message,
      code: 'FEATURE_NOT_INCLUDED',
      featureKey: err.featureKey,
    });
  }
  if (err instanceof UsageLimitExceededError || err.code === 'LIMIT_EXCEEDED') {
    return res.status(403).json({
      error: err.message,
      code: 'LIMIT_EXCEEDED',
      limitKey: err.limitKey,
      limit: err.limit,
      current: err.current,
    });
  }
  if (
    err.name === 'TenantAuthorizationError' ||
    err.name === 'PermissionDeniedError' ||
    (err.message && err.message.toLowerCase().includes('permission denied'))
  ) {
    return res.status(403).json({ error: err.message, code: 'FORBIDDEN_PERMISSION' });
  }
  return res.status(400).json({ error: err.message || 'Billing operation error', code: 'BILLING_ERROR' });
};

// GET /api/business/billing
businessRouter.get('/billing', async (req: TenantRequest, res: Response) => {
  try {
    const details = await getBusinessBillingOverview(req.tenantContext!);
    res.json(details);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});

// POST /api/business/billing/change-plan
businessRouter.post('/billing/change-plan', async (req: TenantRequest, res: Response) => {
  try {
    const { planId, billingInterval } = req.body;
    if (!planId) {
      res.status(400).json({ error: 'planId is required', code: 'BAD_REQUEST' });
      return;
    }
    const result = await changePlan(req.tenantContext!, planId, billingInterval);
    res.json(result);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});

// POST /api/business/billing/cancel
businessRouter.post('/billing/cancel', async (req: TenantRequest, res: Response) => {
  try {
    const immediate = Boolean(req.body?.immediate);
    const result = await cancelSubscription(req.tenantContext!, immediate);
    res.json(result);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});

// POST /api/business/billing/resume
businessRouter.post('/billing/resume', async (req: TenantRequest, res: Response) => {
  try {
    const result = await resumeSubscription(req.tenantContext!);
    res.json(result);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});

// GET /api/business/billing/invoices
businessRouter.get('/billing/invoices', async (req: TenantRequest, res: Response) => {
  try {
    const invoices = await getInvoices(req.tenantContext!);
    res.json(invoices);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});

// GET /api/business/billing/payments
businessRouter.get('/billing/payments', async (req: TenantRequest, res: Response) => {
  try {
    const payments = await getPayments(req.tenantContext!);
    res.json(payments);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});

// GET /api/business/billing/usage
businessRouter.get('/billing/usage', async (req: TenantRequest, res: Response) => {
  try {
    const usage = await getUsageAndLimits(req.tenantContext!.businessId);
    res.json(usage);
  } catch (err: any) {
    handleBillingError(err, res);
  }
});




