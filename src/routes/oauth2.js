// src/routes/oauth2.js
// OAuth2 authentication routes with Passport.js

const express = require('express');
const passport = require('../config/oauth2');
const { signAccessToken, signRefreshToken } = require('../utils/jwt');
const { repo } = require('../db/repo');
const crypto = require('crypto');

const router = express.Router();

// Function to generate tokens and session for authenticated user
async function authenticateUser(req, res, user) {
  try {
    // Create JWT tokens
    const accessToken = signAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      email: user.email
    });
    
    const { token: refreshToken, jti } = signRefreshToken({ sub: user.id });
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Store refresh token
    await repo.addRefreshToken({
      userId: user.id,
      hash: refreshHash,
      issuedAt: new Date()
    });

    // Set session
    req.session.regenerate(err => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ ok: false, error: 'session_error' });
      }
      
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        provider: user.provider
      };
      
      req.session.save(err2 => {
        if (err2) {
          console.error('Session save error:', err2);
          return res.status(500).json({ ok: false, error: 'session_save_error' });
        }
        
        // Return success response with tokens
        res.json({
          ok: true,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            email: user.email,
            provider: user.provider,
            avatar_url: user.avatar_url
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
    console.error('Authentication error:', error);
    res.status(500).json({ ok: false, error: 'authentication_failed' });
  }
}

// Local authentication (existing username/password)
router.post('/login/local', 
  passport.authenticate('local', { session: false }),
  async (req, res) => {
    await authenticateUser(req, res, req.user);
  }
);

// Google OAuth2 routes
router.get('/google', 
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false
  })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  async (req, res) => {
    if (req.user) {
      // For web flow, redirect to dashboard with success
      req.session.regenerate(err => {
        if (err) {
          return res.redirect('/login?error=session_error');
        }
        
        req.session.user = {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          email: req.user.email,
          provider: req.user.provider
        };
        
        req.session.save(err2 => {
          if (err2) {
            return res.redirect('/login?error=session_save_error');
          }
          res.redirect('/dashboard?auth=success');
        });
      });
    } else {
      res.redirect('/login?error=oauth_failed');
    }
  }
);

// GitHub OAuth2 routes
router.get('/github',
  passport.authenticate('github', {
    scope: ['user:email'],
    session: false
  })
);

router.get('/github/callback',
  passport.authenticate('github', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  async (req, res) => {
    if (req.user) {
      // For web flow, redirect to dashboard with success
      req.session.regenerate(err => {
        if (err) {
          return res.redirect('/login?error=session_error');
        }
        
        req.session.user = {
          id: req.user.id,
          username: req.user.username,
          role: req.user.role,
          email: req.user.email,
          provider: req.user.provider
        };
        
        req.session.save(err2 => {
          if (err2) {
            return res.redirect('/login?error=session_save_error');
          }
          res.redirect('/dashboard?auth=success');
        });
      });
    } else {
      res.redirect('/login?error=oauth_failed');
    }
  }
);

// JWT Token refresh endpoint
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ ok: false, error: 'missing_refresh_token' });
    }

    // Verify refresh token
    const { verifyRefresh } = require('../utils/jwt');
    const payload = verifyRefresh(refresh_token);
    if (!payload) {
      return res.status(401).json({ ok: false, error: 'invalid_refresh_token' });
    }

    // Check if refresh token exists and is active
    const refreshHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const isActive = await repo.isRefreshTokenActive({ userId: payload.sub, hash: refreshHash });
    if (!isActive) {
      return res.status(401).json({ ok: false, error: 'refresh_token_revoked' });
    }

    // Get user
    const user = await repo.findUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'user_not_found' });
    }

    // Generate new access token
    const newAccessToken = signAccessToken({
      sub: user.id,
      username: user.username,
      role: user.role,
      email: user.email
    });

    res.json({
      ok: true,
      access_token: newAccessToken,
      token_type: 'Bearer'
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ ok: false, error: 'refresh_failed' });
  }
});

// Get current user info (JWT protected)
router.get('/me', 
  passport.authenticate('jwt', { session: false }),
  (req, res) => {
    res.json({
      ok: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        email: req.user.email,
        provider: req.user.provider || 'local',
        avatar_url: req.user.avatar_url
      }
    });
  }
);

// Revoke refresh token (logout)
router.post('/revoke', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      const { verifyRefresh } = require('../utils/jwt');
      const payload = verifyRefresh(refresh_token);
      if (payload) {
        const refreshHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
        await repo.revokeRefreshToken({ userId: payload.sub, hash: refreshHash });
      }
    }
    
    // Also destroy session if exists
    if (req.session) {
      req.session.destroy(() => {});
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('Token revoke error:', error);
    res.json({ ok: true }); // Always return success for logout
  }
});

module.exports = router;