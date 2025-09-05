// src/utils/jwt.ts
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import cfg from '../config';
import { JWTPayload, RefreshTokenPayload } from '../types';

interface TokenResponse {
  token: string;
  jti: string;
}

export function signAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  return jwt.sign(payload, cfg.jwt.secret, {
    expiresIn: Math.floor(cfg.jwt.accessTtlMs / 1000),
    issuer: cfg.jwt.issuer,
    audience: cfg.jwt.audience
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'jti' | 'iat' | 'exp' | 'iss' | 'aud'>): TokenResponse {
  // include jti for rotation tracking
  const jti = crypto.randomUUID();
  return {
    token: jwt.sign({ ...payload, jti }, cfg.jwt.refreshSecret, {
      expiresIn: Math.floor(cfg.jwt.refreshTtlMs / 1000),
      issuer: cfg.jwt.issuer,
      audience: cfg.jwt.audience
    }),
    jti
  };
}

export function verifyAccess(token: string): JWTPayload {
  return jwt.verify(token, cfg.jwt.secret, {
    issuer: cfg.jwt.issuer,
    audience: cfg.jwt.audience
  }) as JWTPayload;
}

export function verifyRefresh(token: string): RefreshTokenPayload {
  return jwt.verify(token, cfg.jwt.refreshSecret, {
    issuer: cfg.jwt.issuer,
    audience: cfg.jwt.audience
  }) as RefreshTokenPayload;
}