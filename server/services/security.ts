import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const DEV_FALLBACK_SECRET = 'local-dev-discography-tracker-encryption-secret-do-not-use-in-prod';

// Precompute a valid scrypt hash once at module load for constant-time dummy login checks
export const DUMMY_SCRYPT_HASH = (() => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync('dummy-timing-equalizer-password', salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt}$${derived.toString('hex')}`;
})();

function getEncryptionKeyBuffer(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw || raw.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[SECURITY FATAL] ENCRYPTION_KEY must be set in production and be at least 32 characters long.'
      );
    }
    return crypto.createHash('sha256').update(DEV_FALLBACK_SECRET).digest();
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!storedHash || !storedHash.startsWith('scrypt$')) {
      resolve(false);
      return;
    }
    const parts = storedHash.split('$');
    if (parts.length !== 3) {
      resolve(false);
      return;
    }
    const [, salt, hashHex] = parts;
    const expected = Buffer.from(hashHex, 'hex');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err || derived.length !== expected.length) {
        resolve(false);
        return;
      }
      resolve(crypto.timingSafeEqual(derived, expected));
    });
  });
}

export function encryptText(plain: string): string {
  if (!plain) return '';
  const key = getEncryptionKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptText(stored: string | null | undefined): string {
  if (!stored) return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  try {
    const parts = stored.split(':');
    if (parts.length !== 5) return '';
    const [, , ivHex, tagHex, cipherHex] = parts;
    const key = getEncryptionKeyBuffer();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function sanitizeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

export function sanitizeAvatarInput(raw: unknown): string | null | 'invalid' {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    // Allow only compact base64 raster images (strictly blocks SVG/HTML XSS)
    if (
      trimmed.length <= 140_000 &&
      /^data:image\/(webp|jpeg|jpg|png|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)
    ) {
      return trimmed;
    }
    return 'invalid';
  }

  if (trimmed.length > 1000) return 'invalid';
  const httpUrl = sanitizeHttpUrl(trimmed);
  return httpUrl || 'invalid';
}

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  const header = req.get('x-requested-with');
  if (header !== 'DiscographyTracker') {
    res.status(403).json({ error: 'Запит відхилено перевіркою безпеки (CSRF).' });
    return;
  }
  next();
}

export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      if (v.resetAt <= now) hits.delete(k);
    }
  }, Math.max(30_000, opts.windowMs));
  cleanup.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const rec = hits.get(ip);
    if (!rec || rec.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }
    rec.count += 1;
    if (rec.count > opts.max) {
      res.status(429).json({
        error:
          opts.message ||
          'Забагато запитів. Будь ласка, зачекайте кілька хвилин і спробуйте знову.',
      });
      return;
    }
    next();
  };
}

export function getAdminUserId(): number {
  return Number(process.env.ADMIN_USER_ID || 1);
}

export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || 'romankits08@gmail.com').trim().toLowerCase();
}

/**
 * Multi-layer admin verification: requires explicit DB flag, configured user ID,
 * configured lowercase email, an active password hash, and optional display name match.
 */
export function isStrictAdminRow(row: Record<string, unknown> | undefined | null): boolean {
  if (!row) return false;
  if (Number(row.is_admin) !== 1) return false;
  if (Number(row.id) !== getAdminUserId()) return false;
  if (String(row.email || '').trim().toLowerCase() !== getAdminEmail()) return false;
  if (!row.password_hash) return false;
  const requiredName = process.env.ADMIN_DISPLAY_NAME?.trim();
  if (requiredName && String(row.display_name || '') !== requiredName) return false;
  return true;
}

export function hashIpForAnalytics(ip: string): string {
  return sha256Hex(`dtr-analytics-ip:${ip}`).slice(0, 16);
}
