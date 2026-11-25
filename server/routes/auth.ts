import express, { type NextFunction, type Request, type Response } from 'express';
import { attachDefaultArtistsForUser, type Db } from '../db.ts';
import {
  createRateLimiter,
  generateSecureToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from '../services/security.ts';
import type { UserDTO } from '../types.ts';

export const SESSION_COOKIE_NAME = 'dtr_session';
const SESSION_TTL_DAYS = 30;

declare global {
  namespace Express {
    interface Request {
      user?: UserDTO;
      sessionIdHash?: string;
    }
  }
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function mapUserRow(r: Record<string, unknown>): UserDTO {
  return {
    id: Number(r.id),
    email: String(r.email),
    displayName: String(r.display_name),
    avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
    createdAt: String(r.created_at),
  };
}

async function createSessionForUser(
  db: Db,
  userId: number,
  req: Request,
  res: Response
): Promise<void> {
  const rawToken = generateSecureToken(32);
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ua = String(req.get('user-agent') || '').slice(0, 250);

  await db.run(
    `INSERT INTO sessions (id, user_id, user_agent, expires_at) VALUES (?, ?, ?, ?)`,
    [tokenHash, userId, ua, expiresAt]
  );

  res.cookie(SESSION_COOKIE_NAME, rawToken, cookieOptions(SESSION_TTL_DAYS * 24 * 60 * 60 * 1000));
}

export function attachUserMiddleware(getDbFn: () => Promise<Db>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
      if (!rawToken || typeof rawToken !== 'string') {
        next();
        return;
      }
      const db = await getDbFn();
      const tokenHash = sha256Hex(rawToken);
      const row = await db.get<Record<string, unknown>>(
        `SELECT u.*, s.expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > ?`,
        [tokenHash, new Date().toISOString()]
      );
      if (row) {
        req.user = mapUserRow(row);
        req.sessionIdHash = tokenHash;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Необхідна авторизація. Будь ласка, увійдіть в акаунт.' });
    return;
  }
  next();
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createAuthRouter(getDbFn: () => Promise<Db>) {
  const router = express.Router();

  const authRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Забагато спроб входу або реєстрації. Зачекайте 15 хвилин.',
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user || null });
  });

  router.post('/register', authRateLimit, async (req, res) => {
    const db = await getDbFn();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim() || email.split('@')[0];

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Введіть коректну електронну пошту.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Пароль повинен містити щонайменше 8 символів.' });
      return;
    }

    const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      res.status(409).json({ error: 'Акаунт із такою поштою вже існує.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const ins = await db.run(
      `INSERT INTO users (email, display_name, password_hash, email_verified)
       VALUES (?, ?, ?, 0)`,
      [email, displayName.slice(0, 60), passwordHash]
    );

    const userId = ins.lastInsertRowid;
    await attachDefaultArtistsForUser(db, userId);
    await createSessionForUser(db, userId, req, res);

    const created = await db.get<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [userId]);
    res.status(201).json({ user: mapUserRow(created!) });
  });

  router.post('/login', authRateLimit, async (req, res) => {
    const db = await getDbFn();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Введіть електронну пошту та пароль.' });
      return;
    }

    const userRow = await db.get<Record<string, unknown>>('SELECT * FROM users WHERE email = ?', [
      email,
    ]);
    if (!userRow) {
      res.status(401).json({ error: 'Невірна пошта або пароль.' });
      return;
    }

    if (userRow.locked_until && String(userRow.locked_until) > new Date().toISOString()) {
      res.status(423).json({
        error: 'Акаунт тимчасово заблоковано через серію невдалих спроб. Спробуйте через 15 хвилин.',
      });
      return;
    }

    const storedHash = userRow.password_hash ? String(userRow.password_hash) : '';
    const valid = await verifyPassword(password, storedHash);
    if (!valid) {
      const nextAttempts = Number(userRow.failed_login_attempts || 0) + 1;
      const lockedUntil =
        nextAttempts >= 7 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      await db.run(
        `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`,
        [nextAttempts, lockedUntil, Number(userRow.id)]
      );
      res.status(401).json({ error: 'Невірна пошта або пароль.' });
      return;
    }

    await db.run(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?`,
      [Number(userRow.id)]
    );

    await createSessionForUser(db, Number(userRow.id), req, res);
    res.json({ user: mapUserRow(userRow) });
  });

  router.post('/logout', async (req, res) => {
    const db = await getDbFn();
    if (req.sessionIdHash) {
      await db.run('DELETE FROM sessions WHERE id = ?', [req.sessionIdHash]);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  router.put('/profile', requireAuth, async (req, res) => {
    const db = await getDbFn();
    const userId = req.user!.id;
    const displayName =
      req.body?.displayName !== undefined ? String(req.body.displayName).trim() : undefined;
    const email =
      req.body?.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    const userRow = await db.get<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [
      userId,
    ]);
    if (!userRow) {
      res.status(404).json({ error: 'Користувача не знайдено.' });
      return;
    }

    if (displayName !== undefined && displayName.length >= 1) {
      await db.run(`UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?`, [
        displayName.slice(0, 60),
        userId,
      ]);
    }

    if (email !== undefined && email !== String(userRow.email)) {
      if (!EMAIL_REGEX.test(email)) {
        res.status(400).json({ error: 'Некоректна електронна пошта.' });
        return;
      }
      const dup = await db.get<{ id: number }>('SELECT id FROM users WHERE email = ? AND id != ?', [
        email,
        userId,
      ]);
      if (dup) {
        res.status(409).json({ error: 'Ця пошта вже використовується іншим акаунтом.' });
        return;
      }
      await db.run(
        `UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?`,
        [email, userId]
      );
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'Новий пароль повинен мати щонайменше 8 символів.' });
        return;
      }
      if (userRow.password_hash) {
        const ok = await verifyPassword(currentPassword, String(userRow.password_hash));
        if (!ok) {
          res.status(400).json({ error: 'Поточний пароль вказано невірно.' });
          return;
        }
      }
      const hash = await hashPassword(newPassword);
      await db.run(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`, [
        hash,
        userId,
      ]);
    }

    const updated = await db.get<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [
      userId,
    ]);
    res.json({ user: mapUserRow(updated!) });
  });

  return router;
}
