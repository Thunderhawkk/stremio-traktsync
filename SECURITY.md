Tenant isolation
- All configs, tokens, and caches are scoped by userId.
- Addon endpoints include userId in path; optional HMAC signature binds URL to userId and expiry to mitigate enumeration.

Auth
- Password hashing: bcrypt with 11 rounds (configurable 10–12).
- Access tokens: 30m; Refresh tokens: 14d with rotation and revocation list.
- Access and refresh tokens stored in HTTP-only cookies by default.

Transport
- Use HTTPS in production and set COOKIE_SECURE=true.
- CORS restricted to your frontend origin.

Input validation
- Zod validation for all mutating APIs.
- CSRF protection enabled for form-based page endpoints.

Secrets
- JWT secrets, Trakt client credentials, and API keys pulled from environment and never logged.
