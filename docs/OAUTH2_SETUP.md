# OAuth2 Setup Guide

This guide explains how to set up OAuth2 authentication with Google and GitHub providers.

## 1. Google OAuth2 Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Set the application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:8080/auth/google/callback` (development)
   - `https://yourdomain.com/auth/google/callback` (production)
7. Copy the Client ID and Client Secret to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-google-client-id.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8080/auth/google/callback
```

## 2. GitHub OAuth2 Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the application details:
   - Application name: "Stremio Trakt Multi-User"
   - Homepage URL: `http://localhost:8080`
   - Authorization callback URL: `http://localhost:8080/auth/github/callback`
4. Copy the Client ID and Client Secret to your `.env` file:

```env
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:8080/auth/github/callback
```

## 3. Usage

### Authentication URLs

- **Google Login**: `GET /auth/google`
- **GitHub Login**: `GET /auth/github`
- **Local Login**: `POST /auth/login/local`

### API Endpoints

- **Get User Info**: `GET /auth/me` (requires JWT token)
- **Refresh Token**: `POST /auth/refresh`
- **Logout/Revoke**: `POST /auth/revoke`

### Frontend Integration

```javascript
// Redirect to OAuth provider
window.location.href = '/auth/google';

// Or for API-based login
const response = await fetch('/auth/login/local', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
});

const data = await response.json();
if (data.ok) {
  // Store tokens
  localStorage.setItem('access_token', data.tokens.access_token);
  localStorage.setItem('refresh_token', data.tokens.refresh_token);
}
```

### API Authentication

```javascript
// Use JWT token for API calls
const response = await fetch('/api/some-endpoint', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
});
```

## 4. Database Migration

Run the OAuth2 migration to add the necessary tables:

```bash
npm run migrate
```

This will add:
- OAuth2 provider fields to the users table
- OAuth2 clients table
- OAuth2 authorization codes table
- OAuth2 access tokens table
- OAuth2 refresh tokens table

## 5. Security Notes

- Always use HTTPS in production
- Set `COOKIE_SECURE=true` in production
- Use strong, unique secrets for JWT tokens
- Consider implementing rate limiting for OAuth endpoints
- Regularly rotate OAuth2 client secrets