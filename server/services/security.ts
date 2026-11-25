import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const DEV_FALLBACK_SECRET = 'local-dev-discography-tracker-encryption-secret-do-not-use-in-prod';

let warnedMissingKey = false;

function getEncryptionKeyBuffer(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === 'production' && !warnedMissingKey) {
      warnedMissingKey = true;
      console.warn(
        '[SECURITY WARNING] ENCRYPTION_KEY is not set in production! Set a 64-char hex key in environment variables.'
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

export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Periodic cleanup to avoid unbounded memory growth
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
