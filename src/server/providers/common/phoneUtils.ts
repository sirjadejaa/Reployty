/**
 * Reployty V2 — Phase 25 Provider Utilities
 * Phone & Destination Normalization
 */

/**
 * Normalizes phone numbers for SMS and WhatsApp providers (e.g. MSG91, Meta).
 * Defaults to India (+91) if a 10-digit number is provided.
 * Strips spaces, dashes, parentheses, and leading '+' or '0'.
 */
export function normalizePhoneNumber(rawPhone: string, defaultCountryCode: string = '91'): {
  isValid: boolean;
  e164: string;
  digitsOnly: string;
  countryCode: string;
  nationalNumber: string;
} {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { isValid: false, e164: '', digitsOnly: '', countryCode: '', nationalNumber: '' };
  }

  // Strip non-digits except initial '+'
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Remove leading 0 if present (e.g. 09876543210 -> 9876543210)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // 10 digits assumed to be Indian local mobile
  if (cleaned.length === 10) {
    cleaned = `${defaultCountryCode}${cleaned}`;
  }

  // International phone length validation (7 to 15 digits according to E.164)
  const isValid = /^[1-9]\d{6,14}$/.test(cleaned);

  const countryCode = cleaned.startsWith('91') && cleaned.length === 12
    ? '91'
    : cleaned.slice(0, cleaned.length - 10);
  const nationalNumber = cleaned.slice(-10);

  return {
    isValid,
    e164: `+${cleaned}`,
    digitsOnly: cleaned,
    countryCode,
    nationalNumber,
  };
}

/**
 * Validates email address format for Email provider (SendGrid).
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

/**
 * Masks sensitive values like API keys or tokens for safe UI display and audit logs.
 */
export function maskSecret(secret?: string | null): string {
  if (!secret || typeof secret !== 'string') return '';
  const trimmed = secret.trim();
  if (trimmed.length <= 6) {
    return '******';
  }
  const last4 = trimmed.slice(-4);
  return `****${last4}`;
}

/**
 * Masks customer phone number for privacy in analytics and reporting.
 * e.g. "+919876543210" -> "+91****3210"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

