import { createHmac, timingSafeEqual, randomBytes } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────

export type LicenseFeature = 'dine-in' | 'takeaway' | 'delivery' | 'kds' | 'reports' | 'multi-terminal';

export interface LicensePayload {
  /** Human-readable restaurant name */
  restaurantName: string;
  /** ISO date string when license was issued */
  issuedAt: string;
  /** ISO date string when license expires. Null = lifetime. */
  expiresAt: string | null;
  /** Max concurrent POS terminals allowed */
  maxDevices: number;
  /** Feature flags included in this license */
  features: LicenseFeature[];
  /** Unique license identifier (random 8 hex chars) */
  licenseId: string;
  /** Contact email of the licensee */
  email: string;
}

export interface LicenseKey {
  /** The full license key string to distribute to the customer */
  key: string;
  payload: LicensePayload;
}

export type VerifyResult =
  | { valid: true;  payload: LicensePayload; reason?: never }
  | { valid: false; payload?: never;         reason: string };

// ─── Constants ─────────────────────────────────────────────────────────────

const ALGORITHM = 'sha256';
const KEY_PREFIX = 'RPOS';
const SEPARATOR = '.';

// ─── Core helpers ──────────────────────────────────────────────────────────

/**
 * Sign a payload with a secret key using HMAC-SHA256.
 * Returns the signature as a hex string.
 */
function sign(payload: string, secret: string): string {
  return createHmac(ALGORITHM, secret).update(payload).digest('hex');
}

/**
 * Encode a JSON object to a URL-safe base64 string.
 */
function encodePayload(payload: LicensePayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decode a URL-safe base64 string back to a LicensePayload.
 */
function decodePayload(encoded: string): LicensePayload {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as LicensePayload;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Generate a new license key.
 *
 * @param payload  - License data (without licenseId; it is generated automatically)
 * @param secret   - Your private master secret (keep this safe!)
 * @returns        - Object containing the distributable key string and payload
 *
 * @example
 * const { key } = generateLicense({
 *   restaurantName: 'Spice Garden',
 *   email: 'owner@spicegarden.com',
 *   issuedAt: new Date().toISOString().split('T')[0],
 *   expiresAt: '2027-12-31',
 *   maxDevices: 3,
 *   features: ['dine-in', 'takeaway', 'kds'],
 * }, process.env.LICENSE_SECRET!);
 */
export function generateLicense(
  payload: Omit<LicensePayload, 'licenseId'>,
  secret: string,
): LicenseKey {
  if (!secret || secret.length < 16) {
    throw new Error('LICENSE_SECRET must be at least 16 characters');
  }

  const fullPayload: LicensePayload = {
    ...payload,
    licenseId: randomBytes(4).toString('hex').toUpperCase(),
  };

  const encoded = encodePayload(fullPayload);
  const signature = sign(encoded, secret);

  // Key format: RPOS.<base64url-payload>.<hex-signature>
  const key = `${KEY_PREFIX}${SEPARATOR}${encoded}${SEPARATOR}${signature}`;

  return { key, payload: fullPayload };
}

/**
 * Verify a license key string.
 *
 * @param key    - The license key string provided by the customer
 * @param secret - Your private master secret
 * @returns      - `{ valid: true, payload }` or `{ valid: false, reason }`
 */
export function verifyLicense(key: string, secret: string): VerifyResult {
  if (!key || !secret) {
    return { valid: false, reason: 'Missing key or secret' };
  }

  const parts = key.trim().split(SEPARATOR);
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) {
    return { valid: false, reason: 'Invalid license key format' };
  }

  const [, encodedPayload, providedSig] = parts;

  // Timing-safe signature comparison
  const expectedSig = sign(encodedPayload, secret);
  let sigMatch = false;
  try {
    sigMatch = timingSafeEqual(
      Buffer.from(expectedSig, 'hex'),
      Buffer.from(providedSig,  'hex'),
    );
  } catch {
    return { valid: false, reason: 'Signature verification failed' };
  }

  if (!sigMatch) {
    return { valid: false, reason: 'Invalid license key — signature mismatch' };
  }

  // Decode and validate payload
  let payload: LicensePayload;
  try {
    payload = decodePayload(encodedPayload);
  } catch {
    return { valid: false, reason: 'Could not decode license payload' };
  }

  // Expiry check
  if (payload.expiresAt) {
    const expiresAt = new Date(payload.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      return { valid: false, reason: 'Invalid expiry date in license' };
    }
    if (new Date() > expiresAt) {
      return {
        valid: false,
        reason: `License expired on ${payload.expiresAt}`,
      };
    }
  }

  return { valid: true, payload };
}

/**
 * Returns how many days remain on a license (-1 = lifetime, 0 = expired).
 */
export function daysRemaining(payload: LicensePayload): number {
  if (!payload.expiresAt) return -1; // lifetime
  const diff = new Date(payload.expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

