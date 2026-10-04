/**
 * Reployty V2 — Phase 26 Public Tracking Routes
 * Secure click redirect and 1x1 transparent GIF email open tracking
 */

import { Router, Request, Response } from 'express';
import { handleTrackedClick, handleTrackedOpen, TRANSPARENT_1X1_GIF } from '../services/campaignTrackingService';
import { logger } from '../utils/logger';

export const trackingRouter = Router();

/**
 * Click Tracking: GET /api/track/c/:trackingCode or /track/click/:trackingCode
 * Validates tracking token, records click event and unique clicker, emits analytics,
 * and performs secure 302 redirect to originalUrl.
 */
async function handleClickRequest(req: Request, res: Response) {
  const trackingCode = String(req.params.trackingCode || req.params.code || '');
  if (!trackingCode) {
    res.status(400).send('Missing tracking code');
    return;
  }

  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

  try {
    const { redirectUrl } = await handleTrackedClick(trackingCode, {
      ip: clientIp,
      userAgent,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.redirect(302, redirectUrl);
  } catch (err: any) {
    logger.warn('Tracked click resolution failed', { error: err.message, trackingCode });
    if (err.name === 'TrackingLinkNotFoundError') {
      res.status(404).send('Tracking link not found');
      return;
    }
    if (err.name === 'UnsafeRedirectUrlError') {
      res.status(400).send('Invalid or disallowed redirect destination');
      return;
    }
    res.status(500).send('Tracking link error');
  }
}

trackingRouter.get('/c/:trackingCode', handleClickRequest);
trackingRouter.get('/click/:trackingCode', handleClickRequest);

/**
 * Open Tracking: GET /api/track/o/:deliveryId or /track/open/:deliveryId
 * Records email open detection, updates delivery timestamp, and returns 1x1 transparent GIF.
 */
async function handleOpenRequest(req: Request, res: Response) {
  const deliveryId = String(req.params.deliveryId || '');
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  if (!deliveryId) {
    res.status(200).send(TRANSPARENT_1X1_GIF);
    return;
  }

  try {
    const gifBuffer = await handleTrackedOpen(deliveryId, {
      ip: clientIp,
      userAgent,
    });
    res.status(200).send(gifBuffer);
  } catch (err: any) {
    logger.warn('Tracked open resolution error', { error: err.message, deliveryId });
    res.status(200).send(TRANSPARENT_1X1_GIF);
  }
}

trackingRouter.get('/o/:deliveryId', handleOpenRequest);
trackingRouter.get('/open/:deliveryId', handleOpenRequest);
