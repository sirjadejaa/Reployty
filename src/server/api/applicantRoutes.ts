import { Router, Request, Response } from 'express';
import { validateSession } from '../auth/sessionService';
import {
  getApplicantApplications,
  getApplicantApplicationById,
  saveDraftApplication,
  submitDraftApplication,
  submitApplicantAdditionalInfo,
  cancelApplication,
  ProvisioningError,
} from '../services/managedProvisioningService';

export const applicantRouter = Router();

function getSessionToken(req: Request): string | null {
  if (req.cookies && req.cookies['reployty_session']) {
    return req.cookies['reployty_session'];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

// Authentication middleware for applicant routes
async function requireApplicantAuth(req: Request, res: Response, next: Function): Promise<void> {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthenticated: Please log in to manage your application', code: 'UNAUTHENTICATED' });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session', code: 'INVALID_SESSION' });
    return;
  }

  (req as any).user = session.user;
  (req as any).session = session;
  next();
}

applicantRouter.use(requireApplicantAuth);

// GET /api/applications/my
applicantRouter.get('/my', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const applications = await getApplicantApplications(user.id, user.email);
    res.json({
      success: true,
      applications,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch applications', code: 'SERVER_ERROR' });
  }
});

// GET /api/applications/:id
applicantRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const application = await getApplicantApplicationById(String(req.params.id), {
      userId: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
    });
    res.json({
      success: true,
      application,
    });
  } catch (err: any) {
    const status = err instanceof ProvisioningError ? err.status : 404;
    res.status(status).json({ error: err.message || 'Failed to fetch application', code: err.code || 'NOT_FOUND' });
  }
});

// POST /api/applications/draft
applicantRouter.post('/draft', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const draft = await saveDraftApplication(user.id, req.body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(200).json({
      success: true,
      application: draft,
      message: 'Draft application saved successfully',
    });
  } catch (err: any) {
    const status = err instanceof ProvisioningError ? err.status : 400;
    res.status(status).json({ error: err.message || 'Failed to save draft application', code: err.code || 'DRAFT_ERROR' });
  }
});

// POST /api/applications/:id/submit
applicantRouter.post('/:id/submit', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const updated = await submitDraftApplication(String(req.params.id), user.id, req.body);
    res.status(200).json({
      success: true,
      application: updated,
      message: 'Application submitted successfully for Super Admin review',
    });
  } catch (err: any) {
    const status = err instanceof ProvisioningError ? err.status : 400;
    res.status(status).json({ error: err.message || 'Failed to submit application', code: err.code || 'SUBMISSION_ERROR' });
  }
});

// PATCH /api/applications/:id/additional-info
applicantRouter.patch('/:id/additional-info', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { responseText, information, ...fields } = req.body;
    const text = responseText || information;
    const updated = await submitApplicantAdditionalInfo(
      String(req.params.id),
      { userId: user.id, email: user.email },
      text,
      fields
    );
    res.status(200).json({
      success: true,
      request: updated,
      application: updated,
      message: 'Additional information submitted successfully. Status updated to SUBMITTED.',
    });
  } catch (err: any) {
    const status = err instanceof ProvisioningError ? err.status : 400;
    res.status(status).json({ error: err.message || 'Failed to submit additional information', code: err.code || 'UPDATE_ERROR' });
  }
});

// POST /api/applications/:id/cancel
applicantRouter.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { reason } = req.body;
    const updated = await cancelApplication(
      String(req.params.id),
      { userId: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin },
      reason
    );
    res.status(200).json({
      success: true,
      application: updated,
      message: 'Application cancelled successfully',
    });
  } catch (err: any) {
    const status = err instanceof ProvisioningError ? err.status : 400;
    res.status(status).json({ error: err.message || 'Failed to cancel application', code: err.code || 'CANCEL_ERROR' });
  }
});
