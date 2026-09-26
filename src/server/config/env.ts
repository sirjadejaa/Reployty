/**
 * Reployty Centralized Environment Validation Layer
 * Enforces fail-fast configuration verification on server startup.
 * Differentiates required, optional, dev-only, and production-only variables.
 * NEVER leaks secret values in error messages or logs.
 */

export interface AppConfig {
  nodeEnv: 'development' | 'staging' | 'production' | 'test';
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  appUrl: string;
  databaseUrl: string;
  directDatabaseUrl?: string;
  redisUrl?: string;
  sessionSecret?: string;
  customerSessionSecret?: string;
  allowedOrigins: string[];
  billingWebhookSecret?: string;
  paymentProvider: 'simulated' | 'stripe' | 'razorpay';
  otpProvider: 'simulation' | 'twilio' | 'msg91';
  sentryDsn?: string;
  allowProductionBootstrap: boolean;
}

export class ConfigurationError extends Error {
  constructor(message: string, public readonly missingKeys: string[] = []) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Validates and extracts application configuration from environment variables.
 * @param env - Source environment variables dictionary (defaults to process.env)
 * @throws {ConfigurationError} if critical production configuration is missing or invalid.
 */
export function validateEnv(env: Record<string, string | undefined> = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase() as AppConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';
  const isDevelopment = nodeEnv === 'development';
  const isTest = nodeEnv === 'test';

  const missingKeys: string[] = [];
  const validationErrors: string[] = [];

  // 1. Database URL validation
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    missingKeys.push('DATABASE_URL');
  } else if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    validationErrors.push('DATABASE_URL must be a valid PostgreSQL connection string starting with postgresql:// or postgres://');
  }

  // 2. Production-Specific Checks
  const appUrl = env.APP_URL || (isProduction ? '' : 'http://localhost:3000');
  if (isProduction && !env.APP_URL) {
    missingKeys.push('APP_URL');
  } else if (isProduction && env.APP_URL && !env.APP_URL.startsWith('https://')) {
    validationErrors.push('APP_URL in production must use HTTPS (e.g. https://app.reployty.com)');
  }

  // 3. CORS Allowed Origins
  const rawOrigins = env.ALLOWED_ORIGINS || '';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (isProduction) {
    if (allowedOrigins.length === 0) {
      missingKeys.push('ALLOWED_ORIGINS');
    }
    for (const origin of allowedOrigins) {
      if (origin === '*') {
        validationErrors.push('ALLOWED_ORIGINS cannot contain wildcard "*" in production for credentialed SaaS');
      }
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        validationErrors.push(`ALLOWED_ORIGINS in production cannot contain local development origins: "${origin}"`);
      }
      if (!origin.startsWith('https://')) {
        validationErrors.push(`ALLOWED_ORIGINS in production must use HTTPS: "${origin}"`);
      }
    }
  }

  // 4. Webhook Secret in Production
  if (isProduction && !env.BILLING_WEBHOOK_SECRET) {
    missingKeys.push('BILLING_WEBHOOK_SECRET');
  }

  // 5. Fail Fast on Errors
  if (missingKeys.length > 0 || validationErrors.length > 0) {
    const errorDetails: string[] = [];
    if (missingKeys.length > 0) {
      errorDetails.push(`Missing required environment variables: [${missingKeys.join(', ')}]`);
    }
    if (validationErrors.length > 0) {
      errorDetails.push(`Environment validation failures: ${validationErrors.join('; ')}`);
    }
    throw new ConfigurationError(`Configuration error: ${errorDetails.join(' | ')}`, missingKeys);
  }

  const port = parseInt(env.PORT || '3000', 10);

  return {
    nodeEnv,
    isProduction,
    isStaging,
    isDevelopment,
    isTest,
    port: isNaN(port) ? 3000 : port,
    appUrl,
    databaseUrl: databaseUrl!,
    directDatabaseUrl: env.DIRECT_DATABASE_URL,
    redisUrl: env.REDIS_URL,
    sessionSecret: env.SESSION_SECRET,
    customerSessionSecret: env.CUSTOMER_SESSION_SECRET,
    allowedOrigins,
    billingWebhookSecret: env.BILLING_WEBHOOK_SECRET,
    paymentProvider: (env.PAYMENT_PROVIDER as any) || 'simulated',
    otpProvider: (env.OTP_PROVIDER as any) || 'simulation',
    sentryDsn: env.SENTRY_DSN,
    allowProductionBootstrap: env.ALLOW_PRODUCTION_BOOTSTRAP === 'true',
  };
}

let cachedConfig: AppConfig | null = null;

/**
 * Returns the cached application configuration or validates and caches it.
 */
export function getAppConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

export function resetAppConfigForTesting(): void {
  cachedConfig = null;
}
