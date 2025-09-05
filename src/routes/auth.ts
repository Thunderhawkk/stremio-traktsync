// src/routes/auth.ts
// Legacy auth routes (maintained for backward compatibility)
// New OAuth2 routes are in /src/routes/oauth2.ts

import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { createUser, login } from '../services/auth';
import { signAccessToken, signRefreshToken } from '../utils/jwt';
import { repo } from '../db/repo';
import { AuthenticatedRequest, CreateUserData } from '../types';

const router = Router();

function noCache(_req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  res.set('Vary', 'Cookie');
  next();
}

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password }: CreateUserData = req.body || {};
    if (!username || !password) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    
    const u = await createUser({ username, email, password, role: 'user' });

    (req as any).session.regenerate((err: any) => {
      if (err) {
        res.status(500).json({ ok: false, error: 'session_regenerate_failed' });
        return;
      }
      
      (req as any).session.user = { 
        id: u.id, 
        username: u.username, 
        role: u.role, 
        email: u.email,
        provider: u.provider
      };
      
      (req as any).session.save((err2: any) => {
        if (err2) {
          res.status(500).json({ ok: false, error: 'session_save_failed' });
          return;
        }
        res.status(200).json({ 
          ok: true, 
          user: { 
            id: u.id, 
            username: u.username, 
            role: u.role, 
            email: u.email 
          } 
        });
      });
    });
  } catch (e: any) {
    res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password }: { username: string; password: string } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ ok: false, error: 'missing_fields' });
      return;
    }
    
    const u = await login({ username, password }); // bcrypt or Argon2id
    if (!u) {
      res.status(401).json({ ok: false, error: 'invalid_credentials' });
      return;
    }

    // Generate JWT tokens
    const accessToken = signAccessToken({
      sub: u.id,
      username: u.username,
      role: u.role,
      email: u.email
    });
    
    const { token: refreshToken, jti } = signRefreshToken({ sub: u.id });
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Store refresh token
    await repo.addRefreshToken({
      userId: u.id,
      hash: refreshHash,
      issuedAt: new Date()
    });

    (req as any).session.regenerate((err: any) => {
      if (err) {
        res.status(500).json({ ok: false, error: 'session_regenerate_failed' });
        return;
      }
      
      (req as any).session.user = { 
        id: u.id, 
        username: u.username, 
        role: u.role, 
        email: u.email,
        provider: u.provider
      };
      
      (req as any).session.save((err2: any) => {
        if (err2) {
          res.status(500).json({ ok: false, error: 'session_save_failed' });
          return;
        }
        res.status(200).json({
          ok: true,
          user: { 
            id: u.id, 
            username: u.username, 
            role: u.role, 
            email: u.email 
          },
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer'
          }
        });
      });
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'login_failed' });
  }
});

router.get('/me', noCache, (req: Request, res: Response): void => {
  const user = (req as any).session?.user || null;
  res.status(200).json({ ok: true, user });
});

router.post('/logout', (req: Request, res: Response): void => {
  if ((req as any).session) {
    (req as any).session.destroy(() => res.json({ ok: true }));
  } else {
    res.json({ ok: true });
  }
});

export default router;