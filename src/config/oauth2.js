// src/config/oauth2.js
// OAuth2 and Passport configuration

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;

const { repo } = require('../db/repo');
const { verifyAndMaybeMigrate } = require('../services/auth');
const cfg = require('./index');

// Serialize/deserialize user for sessions
passport.serializeUser((user, done) => {
  done(null, { id: user.id, username: user.username, role: user.role });
});

passport.deserializeUser(async (sessionUser, done) => {
  try {
    const user = await repo.findUserById(sessionUser.id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Local Strategy (existing username/password)
passport.use(new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    try {
      const user = await repo.findUserByUsername(username);
      if (!user) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      const isValid = await verifyAndMaybeMigrate({ user, plain: password });
      if (!isValid) {
        return done(null, false, { message: 'Invalid credentials' });
      }

      await repo.updateUserLoginAt(user.id).catch(() => {});
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// JWT Strategy for API authentication
passport.use(new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: cfg.jwt.secret,
    issuer: cfg.jwt.issuer,
    audience: cfg.jwt.audience
  },
  async (payload, done) => {
    try {
      const user = await repo.findUserById(payload.sub);
      if (user) {
        return done(null, user);
      }
      return done(null, false);
    } catch (err) {
      return done(err, false);
    }
  }
));

// Google OAuth2 Strategy
if (cfg.oauth.google.clientId && cfg.oauth.google.clientSecret) {
  console.log('Google OAuth2 Configuration:');
  console.log('- Client ID:', cfg.oauth.google.clientId.substring(0, 10) + '...');
  console.log('- Client Secret:', cfg.oauth.google.clientSecret ? 'Set' : 'Not Set');
  console.log('- Callback URL:', cfg.oauth.google.callbackURL);
  
  try {
    passport.use(new GoogleStrategy(
      {
        clientID: cfg.oauth.google.clientId,
        clientSecret: cfg.oauth.google.clientSecret,
        callbackURL: cfg.oauth.google.callbackURL || '/auth/google/callback'
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user exists with this Google ID
          let user = await repo.findUserByProvider('google', profile.id);
          
          if (!user) {
            // Check if user exists with same email
            const emailUser = await repo.findUserByEmail(profile.emails[0].value);
            if (emailUser) {
              // Link existing account
              user = await repo.updateUser(emailUser.id, {
                provider: 'google',
                provider_id: profile.id,
                avatar_url: profile.photos[0]?.value,
                email_verified: profile.emails[0]?.verified || true
              });
            } else {
              // Create new user
              user = await repo.createUser({
                username: profile.username || profile.displayName || profile.emails[0].value.split('@')[0],
                email: profile.emails[0].value,
                provider: 'google',
                provider_id: profile.id,
                avatar_url: profile.photos[0]?.value,
                email_verified: profile.emails[0]?.verified || true,
                role: 'user'
              });
            }
          }

          await repo.updateUserLoginAt(user.id).catch(() => {});
          return done(null, user);
        } catch (err) {
          console.error('Google OAuth error:', err);
          return done(err, null);
        }
      }
    ));
  } catch (error) {
    console.error('Failed to configure Google OAuth strategy:', error);
  }
} else {
  console.warn('Google OAuth not configured - missing client ID or secret');
}

// GitHub OAuth2 Strategy
if (cfg.oauth.github.clientId && cfg.oauth.github.clientSecret) {
  passport.use(new GitHubStrategy(
    {
      clientID: cfg.oauth.github.clientId,
      clientSecret: cfg.oauth.github.clientSecret,
      callbackURL: cfg.oauth.github.callbackURL || '/auth/github/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists with this GitHub ID
        let user = await repo.findUserByProvider('github', profile.id);
        
        if (!user) {
          // Check if user exists with same email
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const emailUser = email ? await repo.findUserByEmail(email) : null;
          
          if (emailUser) {
            // Link existing account
            user = await repo.updateUser(emailUser.id, {
              provider: 'github',
              provider_id: profile.id,
              avatar_url: profile.photos[0]?.value,
              email_verified: true
            });
          } else {
            // Create new user
            user = await repo.createUser({
              username: profile.username || profile.displayName || `github_${profile.id}`,
              email: email,
              provider: 'github',
              provider_id: profile.id,
              avatar_url: profile.photos[0]?.value,
              email_verified: true,
              role: 'user'
            });
          }
        }

        await repo.updateUserLoginAt(user.id).catch(() => {});
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  ));
}

module.exports = passport;