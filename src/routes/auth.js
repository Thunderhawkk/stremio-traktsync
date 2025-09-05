// src/routes/auth.js
// Legacy auth routes (maintained for backward compatibility)
// New OAuth2 routes are in /src/routes/oauth2.js

const express = require('express');
const { createUser, login } = require('../services/auth');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');
const { repo } = require('../db/repo');
const crypto = require('crypto');
const { auditAuthEvents } = require('../middleware/auditLogger');

const router = express.Router();
const authAudit = auditAuthEvents();

function noCache(_req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  res.set('Vary', 'Cookie');
  next();
}

router.post('/register', async (req, res) => {
  const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  try {
    const { username, email, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok:false, error:'missing_fields' });
    const u = await createUser({ username, email, password, role:'user' });

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ ok:false, error:'session_regenerate_failed' });
      req.session.user = { id: u.id, username: u.username, role: u.role };
      req.session.save(async err2 => {
        if (err2) return res.status(500).json({ ok:false, error:'session_save_failed' });
        
        // Log successful registration
        await authAudit.logLogin(u.id, req.sessionID, clientIP, userAgent, true, {
          method: 'registration',
          email: !!email
        });
        
        res.status(200).json({ ok:true, user: { id:u.id, username:u.username, role:u.role } });
      });
    });
  } catch (e) {
    // Log failed registration
    await authAudit.logLogin(null, req.sessionID, clientIP, userAgent, false, {
      method: 'registration',
      error: e.message || 'unknown_error',
      username: req.body?.username
    });
    
    res.status(400).json({ ok:false, error:String(e&&e.message||e) });
  }
});

router.post('/login', async (req, res) => {
  const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok:false, error:'missing_fields' });
    const u = await login({ username, password }); // bcrypt or Argon2id
    
    if (!u) {
      // Log failed login attempt
      await authAudit.logLogin(null, req.sessionID, clientIP, userAgent, false, {
        method: 'password',
        username,
        error: 'invalid_credentials'
      });
      return res.status(401).json({ ok:false, error:'invalid_credentials' });
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

    req.session.regenerate(err => {
      if (err) return res.status(500).json({ ok:false, error:'session_regenerate_failed' });
      req.session.user = { id: u.id, username: u.username, role: u.role, email: u.email };
      req.session.save(async err2 => {
        if (err2) return res.status(500).json({ ok:false, error:'session_save_failed' });
        
        // Log successful login
        await authAudit.logLogin(u.id, req.sessionID, clientIP, userAgent, true, {
          method: 'password'
        });
        
        res.status(200).json({
          ok:true,
          user: { id:u.id, username:u.username, role:u.role, email:u.email },
          tokens: {
            access_token: accessToken,
            refresh_token: refreshToken,
            token_type: 'Bearer'
          }
        });
      });
    });
  } catch (e) {
    // Log login system error
    await authAudit.logLogin(null, req.sessionID, clientIP, userAgent, false, {
      method: 'password',
      username: req.body?.username,
      error: 'system_error'
    });
    
    res.status(500).json({ ok:false, error:'login_failed' });
  }
});

router.get('/me', noCache, (req, res) => {
  const user = req.session && req.session.user || null;
  res.status(200).json({ ok:true, user });
});

router.post('/logout', async (req, res) => {
  const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
  const userId = req.session?.user?.id;
  const sessionId = req.sessionID;
  
  if (userId && sessionId) {
    // Log logout before destroying session
    await authAudit.logLogout(userId, sessionId, clientIP, 'user_initiated');
  }
  
  if (req.session) req.session.destroy(() => res.json({ ok:true }));
  else res.json({ ok:true });
});

module.exports = router;
