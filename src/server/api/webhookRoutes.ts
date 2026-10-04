/**
 * Reployty V2 — Phase 25 Provider Webhook Routes
 * Secure ingestion for Meta WhatsApp, MSG91, and SendGrid delivery events
 */

import { Router, Request, Response } from 'express';
import { CampaignChannel } from '@prisma/client';
import { processProviderWebhook } from '../services/messagingProviderService';
import { webhookRateLimiter } from '../auth/rateLimiter';
import { logger } from '../utils/logger';

export const webhookRouter = Router();

// Apply rate limiting to all inbound webhooks
webhookRouter.use((req: Request, res: Response, next) => {
  const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const rateCheck = webhookRateLimiter.consume(clientIp);
  if (!rateCheck.allowed) {
    res.status(429).json({
      error: `Webhook rate limit exceeded. Retry in ${rateCheck.retryAfterSeconds}s`,
      code: 'RATE_LIMIT_EXCEEDED',
    });
    return;
  }
  next();
});

/**
 * Meta WhatsApp Webhook Handshake Verification (GET)
 */
webhookRouter.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'reployty_whatsapp_verify_token';

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('Meta WhatsApp webhook subscription verified');
    res.status(200).send(challenge);
    return;
  }

  logger.warn('Meta WhatsApp webhook subscription failed verification');
  res.status(403).json({ error: 'Forbidden: Invalid verify token' });
});

/**
 * Meta WhatsApp Status Update Webhook (POST)
 */
webhookRouter.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    const result = await processProviderWebhook('META_WHATSAPP', CampaignChannel.WHATSAPP, req.body, req.headers);
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    logger.error('Meta WhatsApp webhook processing error', { error: err.message });
    const isAuth = err.message.toLowerCase().includes('signature');
    res.status(isAuth ? 401 : 400).json({ error: err.message, code: isAuth ? 'INVALID_SIGNATURE' : 'WEBHOOK_ERROR' });
  }
});

/**
 * MSG91 Delivery Status Webhook (POST)
 */
webhookRouter.post('/msg91', async (req: Request, res: Response) => {
  try {
    const result = await processProviderWebhook('MSG91', CampaignChannel.SMS, req.body, req.headers);
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    logger.error('MSG91 webhook processing error', { error: err.message });
    const isAuth = err.message.toLowerCase().includes('signature');
    res.status(isAuth ? 401 : 400).json({ error: err.message, code: isAuth ? 'INVALID_SIGNATURE' : 'WEBHOOK_ERROR' });
  }
});

/**
 * SendGrid Event Webhook (POST)
 */
webhookRouter.post('/sendgrid', async (req: Request, res: Response) => {
  try {
    const result = await processProviderWebhook('SENDGRID', CampaignChannel.EMAIL, req.body, req.headers);
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    logger.error('SendGrid webhook processing error', { error: err.message });
    const isAuth = err.message.toLowerCase().includes('signature');
    res.status(isAuth ? 401 : 400).json({ error: err.message, code: isAuth ? 'INVALID_SIGNATURE' : 'WEBHOOK_ERROR' });
  }
});

/**
 * Test Mock Provider Webhook (POST)
 */
webhookRouter.post('/mock', async (req: Request, res: Response) => {
  try {
    const channel = (req.body?.channel as CampaignChannel) || CampaignChannel.SMS;
    const result = await processProviderWebhook('MOCK', channel, req.body, req.headers);
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    logger.error('Mock webhook processing error', { error: err.message });
    const isAuth = err.message.toLowerCase().includes('signature');
    res.status(isAuth ? 401 : 400).json({ error: err.message, code: isAuth ? 'INVALID_SIGNATURE' : 'WEBHOOK_ERROR' });
  }
});
