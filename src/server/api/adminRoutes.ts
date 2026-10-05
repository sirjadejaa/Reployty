import { Router, Response } from 'express';
import { TenantRequest } from './app';
import {
  getPlatformOverview,
  getPlatformBusinesses,
  getPlatformBusinessById,
  updatePlatformBusinessStatus,
  getPlatformUsers,
  updatePlatformUserStatus,
  getPlatformMemberships,
  updatePlatformMembershipStatus,
  getPlatformRoles,
  getPlatformAuditLogs,
  getPlatformAnalytics,
} from '../services/platformService';
import {
  getAllPlans,
  createPlan,
  updatePlan,
  adminGetAllSubscriptions,
  adminGetAllInvoices,
  adminGetAllPayments,
  adminUpdateSubscriptionStatus,
  handlePaymentWebhook,
  adminAssignBusinessPlan,
} from '../services/billingService';
import { PLATFORM_FEATURES } from '../services/entitlementService';
import { UsageMeterService } from '../services/usageMeterService';
import { BusinessStatus, UserStatus, MembershipStatus, SubscriptionStatus, OnboardingRequestStatus } from '@prisma/client';
import {
  listOnboardingRequests,
  getOnboardingRequestById,
  updateOnboardingRequestStatus,
  provisionBusinessFromRequest,
} from '../services/managedProvisioningService';

export const adminRouter = Router();

// ============================================================================
// 1. GET /api/admin/overview
// ============================================================================
adminRouter.get('/overview', async (_req: TenantRequest, res: Response): Promise<void> => {
  try {
    const data = await getPlatformOverview();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch platform overview', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 2. GET /api/admin/businesses
// ============================================================================
adminRouter.get('/businesses', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { page, pageSize, search, status, category } = req.query;
    const data = await getPlatformBusinesses({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
      category: typeof category === 'string' ? category : undefined,
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch businesses', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 3. GET /api/admin/businesses/:id
// ============================================================================
adminRouter.get('/businesses/:id', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const businessId = String(req.params.id);
    const business = await getPlatformBusinessById(businessId);
    if (!business) {
      res.status(404).json({ error: 'Business not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(business);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch business details', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 4. PATCH /api/admin/businesses/:id/status
// ============================================================================
adminRouter.patch('/businesses/:id/status', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const businessId = String(req.params.id);
    const { status, reason } = req.body;

    if (!status || !Object.values(BusinessStatus).includes(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${Object.values(BusinessStatus).join(', ')}`,
        code: 'INVALID_STATUS',
      });
      return;
    }

    const updated = await updatePlatformBusinessStatus(
      req.tenantContext!,
      businessId,
      status as BusinessStatus,
      typeof reason === 'string' ? reason : undefined
    );

    res.json({
      success: true,
      businessId: updated.id,
      status: updated.status,
      message: `Business status successfully updated to ${updated.status}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update business status', code: 'MUTATION_ERROR' });
  }
});

// ============================================================================
// 5. GET /api/admin/users
// ============================================================================
adminRouter.get('/users', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { page, pageSize, search, status } = req.query;
    const data = await getPlatformUsers({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch users', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 6. PATCH /api/admin/users/:id/status
// ============================================================================
adminRouter.patch('/users/:id/status', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const targetUserId = String(req.params.id);
    const { status, reason } = req.body;

    if (!status || !Object.values(UserStatus).includes(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${Object.values(UserStatus).join(', ')}`,
        code: 'INVALID_STATUS',
      });
      return;
    }

    const updated = await updatePlatformUserStatus(
      req.tenantContext!,
      targetUserId,
      status as UserStatus,
      typeof reason === 'string' ? reason : undefined
    );

    res.json({
      success: true,
      userId: updated.id,
      status: updated.status,
      message: `User status successfully updated to ${updated.status}`,
    });
  } catch (err: any) {
    // 400 for self-lockout or invalid transition
    res.status(400).json({ error: err.message || 'Failed to update user status', code: 'MUTATION_ERROR' });
  }
});

// ============================================================================
// 7. GET /api/admin/memberships
// ============================================================================
adminRouter.get('/memberships', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { page, pageSize, search, status } = req.query;
    const data = await getPlatformMemberships({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' ? status : undefined,
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch memberships', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 8. PATCH /api/admin/memberships/:id/status
// ============================================================================
adminRouter.patch('/memberships/:id/status', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const membershipId = String(req.params.id);
    const { status } = req.body;

    if (!status || !Object.values(MembershipStatus).includes(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${Object.values(MembershipStatus).join(', ')}`,
        code: 'INVALID_STATUS',
      });
      return;
    }

    const updated = await updatePlatformMembershipStatus(
      req.tenantContext!,
      membershipId,
      status as MembershipStatus
    );

    res.json({
      success: true,
      membershipId: updated.id,
      status: updated.status,
      message: `Membership status updated to ${updated.status}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update membership status', code: 'MUTATION_ERROR' });
  }
});

// ============================================================================
// 9. GET /api/admin/roles
// ============================================================================
adminRouter.get('/roles', async (_req: TenantRequest, res: Response): Promise<void> => {
  try {
    const roles = await getPlatformRoles();
    res.json({ roles });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch roles', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 10. GET /api/admin/audit-logs
// ============================================================================
adminRouter.get('/audit-logs', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { page, pageSize, search, action, businessId } = req.query;
    const data = await getPlatformAuditLogs({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      search: typeof search === 'string' ? search : undefined,
      action: typeof action === 'string' ? action : undefined,
      businessId: typeof businessId === 'string' ? businessId : undefined,
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 11. GET /api/admin/analytics
// ============================================================================
adminRouter.get('/analytics', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const timeRange = (req.query.range as any) || '30d';
    const data = await getPlatformAnalytics(timeRange);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate analytics', code: 'PLATFORM_ERROR' });
  }
});

// ============================================================================
// 12. PLANS MANAGEMENT
// ============================================================================
adminRouter.get('/plans', async (_req: TenantRequest, res: Response): Promise<void> => {
  try {
    const plans = await getAllPlans(false);
    res.json(plans);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch plans', code: 'PLATFORM_ERROR' });
  }
});

adminRouter.post('/plans', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const plan = await createPlan(req.tenantContext!, req.body);
    res.status(201).json(plan);
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'PLAN_ERROR' });
  }
});

adminRouter.put('/plans/:id', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const plan = await updatePlan(req.tenantContext!, String(req.params.id), req.body);
    res.json(plan);
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'PLAN_ERROR' });
  }
});

// GET /api/admin/features
adminRouter.get('/features', async (_req: TenantRequest, res: Response): Promise<void> => {
  res.json(PLATFORM_FEATURES);
});

// PUT /api/admin/businesses/:id/plan
adminRouter.put('/businesses/:id/plan', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { planId } = req.body;
    if (!planId) {
      res.status(400).json({ error: 'planId is required', code: 'BAD_REQUEST' });
      return;
    }
    const result = await adminAssignBusinessPlan(req.tenantContext!, String(req.params.id), String(planId));
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    res.status(status).json({ error: err.message, code: 'PLAN_ASSIGN_ERROR' });
  }
});

// ============================================================================
// 13. ADMIN BILLING, SUBSCRIPTIONS & INVOICES
// ============================================================================
adminRouter.get('/billing/subscriptions', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const subs = await adminGetAllSubscriptions(req.tenantContext!);
    res.json(subs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch subscriptions', code: 'PLATFORM_ERROR' });
  }
});

adminRouter.get('/billing/invoices', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const invoices = await adminGetAllInvoices(req.tenantContext!);
    res.json(invoices);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch invoices', code: 'PLATFORM_ERROR' });
  }
});

adminRouter.get('/billing/payments', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const payments = await adminGetAllPayments(req.tenantContext!);
    res.json(payments);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch payments', code: 'PLATFORM_ERROR' });
  }
});

adminRouter.post('/billing/subscriptions/:id/status', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { status, graceDays } = req.body;
    const sub = await adminUpdateSubscriptionStatus(
      req.tenantContext!,
      String(req.params.id),
      status as SubscriptionStatus,
      graceDays ? Number(graceDays) : undefined
    );
    res.json(sub);
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'SUBSCRIPTION_ERROR' });
  }
});

adminRouter.post('/billing/webhook-simulate', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const result = await handlePaymentWebhook(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message, code: 'WEBHOOK_ERROR' });
  }
});

// ============================================================================
// 14. ADMIN USAGE METERING & INSPECTION (Phase 28)
// ============================================================================
adminRouter.get('/businesses/:businessId/usage', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const summary = await UsageMeterService.getAdminBusinessUsage(
      req.tenantContext!,
      String(req.params.businessId)
    );
    res.json(summary);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' || err.message?.includes('Super admin') ? 403 : 404;
    res.status(status).json({ error: err.message, code: status === 403 ? 'FORBIDDEN' : 'NOT_FOUND' });
  }
});

adminRouter.post('/businesses/:businessId/usage/correct', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { meterType, quantity, reason } = req.body;
    if (!meterType || quantity === undefined || !reason) {
      res.status(400).json({ error: 'meterType, quantity, and reason are required', code: 'BAD_REQUEST' });
      return;
    }
    const event = await UsageMeterService.recordUsageCorrection(
      req.tenantContext!,
      String(req.params.businessId),
      {
        meterType,
        quantity: Number(quantity),
        reason: String(reason),
      }
    );
    res.status(201).json(event);
  } catch (err: any) {
    const status = err.name === 'PermissionDeniedError' || err.message?.includes('Super admin') ? 403 : 400;
    res.status(status).json({ error: err.message, code: status === 403 ? 'FORBIDDEN' : 'CORRECTION_ERROR' });
  }
});

// ============================================================================
// 15. MANAGED BUSINESS ONBOARDING & PROVISIONING (Phase 29 Managed Provisioning)
// ============================================================================

// GET /api/admin/onboarding-requests
adminRouter.get('/onboarding-requests', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { page, pageSize, search, status } = req.query;
    const result = await listOnboardingRequests({
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
      search: typeof search === 'string' ? search : undefined,
      status: typeof status === 'string' && status !== 'ALL' ? (status as OnboardingRequestStatus) : undefined,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list onboarding requests', code: 'PLATFORM_ERROR' });
  }
});

// GET /api/admin/onboarding-requests/:id
adminRouter.get('/onboarding-requests/:id', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const request = await getOnboardingRequestById(String(req.params.id));
    if (!request) {
      res.status(404).json({ error: 'Onboarding request not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(request);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch onboarding request', code: 'PLATFORM_ERROR' });
  }
});

// PATCH /api/admin/onboarding-requests/:id/status
adminRouter.patch('/onboarding-requests/:id/status', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { status, reviewNotes } = req.body;
    if (!status || !Object.values(OnboardingRequestStatus).includes(status)) {
      res.status(400).json({
        error: `Invalid status. Must be one of: ${Object.values(OnboardingRequestStatus).join(', ')}`,
        code: 'INVALID_STATUS',
      });
      return;
    }

    const updated = await updateOnboardingRequestStatus(
      req.tenantContext!,
      String(req.params.id),
      status as OnboardingRequestStatus,
      { notes: typeof reviewNotes === 'string' ? reviewNotes : undefined }
    );

    res.json({
      success: true,
      request: updated,
      message: `Onboarding request status updated to ${updated.status}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update request status', code: 'MUTATION_ERROR' });
  }
});

// POST /api/admin/onboarding-requests/:id/provision
adminRouter.post('/onboarding-requests/:id/provision', async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const result = await provisionBusinessFromRequest(
      req.tenantContext!,
      String(req.params.id)
    );

    res.status(200).json({
      success: true,
      alreadyProvisioned: result.alreadyProvisioned,
      business: result.business,
      owner: result.owner,
      branch: result.branch,
      qrCode: result.qrCode,
      invitation: result.invitation
        ? {
            id: result.invitation.id,
            expiresAt: result.invitation.expiresAt,
            setupUrl: result.invitation.setupUrl,
            rawToken: result.invitation.rawToken,
          }
        : null,
      message: result.message,
    });

  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Failed to provision business',
      code: 'PROVISIONING_ERROR',
    });
  }
});


