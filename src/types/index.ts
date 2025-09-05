// src/types/index.ts
// Main type definitions for the application

import { Request, Response, NextFunction } from 'express';

export interface User {
  id: string;
  username: string;
  email?: string;
  password_hash?: string;
  role: UserRole;
  provider: AuthProvider;
  provider_id?: string;
  avatar_url?: string;
  email_verified: boolean;
  addon_token?: string;
  manifest_version: number;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  last_auto_refresh_at?: Date;
  last_manual_refresh_at?: Date;
}

export type UserRole = 'user' | 'admin' | 'moderator';
export type AuthProvider = 'local' | 'google' | 'github' | 'facebook' | 'twitter';

export interface CreateUserData {
  username: string;
  email?: string;
  password?: string;
  role?: UserRole;
  provider?: AuthProvider;
  provider_id?: string;
  avatar_url?: string;
  email_verified?: boolean;
}

export interface TraktTokens {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: number;
  user_id: string;
  refresh_token_hash: string;
  issued_at: Date;
  revoked_at?: Date;
}

export interface ListConfig {
  id: string;
  user_id: string;
  name: string;
  url: string;
  type: ListType;
  sort_by?: string;
  sort_order?: SortOrder;
  enabled: boolean;
  order?: number;
  created_at: Date;
  updated_at: Date;
}

export type ListType = 'movie' | 'series';
export type SortOrder = 'asc' | 'desc';

export interface OAuth2Client {
  id: string;
  client_id: string;
  client_secret: string;
  name: string;
  redirect_uris: string[];
  grant_types: string[];
  scope: string;
  trusted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OAuth2AuthorizationCode {
  id: string;
  authorization_code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope?: string;
  expires_at: Date;
  created_at: Date;
}

export interface OAuth2AccessToken {
  id: string;
  access_token: string;
  client_id: string;
  user_id: string;
  scope?: string;
  expires_at: Date;
  created_at: Date;
}

export interface OAuth2RefreshToken {
  id: string;
  refresh_token: string;
  client_id: string;
  user_id: string;
  scope?: string;
  expires_at?: Date;
  created_at: Date;
}

// JWT Payload types
export interface JWTPayload {
  sub: string; // user id
  username?: string;
  role?: UserRole;
  email?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

// API Response types
export interface ApiResponse<T = any> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface AuthResponse extends ApiResponse {
  user?: {
    id: string;
    username: string;
    role: UserRole;
    email?: string;
    provider?: AuthProvider;
    avatar_url?: string;
  };
  tokens?: {
    access_token: string;
    refresh_token: string;
    token_type: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Database operation types
export interface DatabaseMetrics {
  tableStats: any[];
  indexStats: any[];
  connectionStats: any;
}

export interface UserStatistics {
  total_users: number;
  active_users_7d: number;
  active_users_30d: number;
  oauth_users: number;
  new_users_7d: number;
  new_users_30d: number;
}

export interface RefreshTokenStats {
  total_tokens: number;
  active_tokens: number;
  revoked_tokens: number;
  tokens_24h: number;
  tokens_7d: number;
}

export interface UserActivitySummary {
  login_date: string;
  user_count: number;
}

// Configuration types
export interface Config {
  baseUrl: string;
  jwt: {
    secret: string;
    refreshSecret: string;
    accessTtlMs: number;
    refreshTtlMs: number;
    issuer: string;
    audience: string;
  };
  oauth: {
    google: {
      clientId: string;
      clientSecret: string;
      callbackURL: string;
    };
    github: {
      clientId: string;
      clientSecret: string;
      callbackURL: string;
    };
  };
  bcryptRounds: number;
  cookies: {
    secure: boolean;
    sameSite: string;
  };
  corsOrigin: string;
  addonSigning: {
    secret: string;
    ttlSeconds: number;
  };
  trakt: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  OMDB_API_KEY: string;
  FANARTTV_API_KEY: string;
  db: {
    url: string;
    dataDir: string;
  };
  logLevel: string;
  stremioApiBase: string;
}

// Express middleware types
export interface AuthenticatedRequest extends Request {
  user?: User;
  session: any; // Using any to avoid Express session type conflicts
  tenantUserId?: string;
}

// Utility types
export type OptionalExceptFor<T, TRequired extends keyof T> = Partial<T> & Pick<T, TRequired>;
export type WithTimestamps<T> = T & {
  created_at: Date;
  updated_at: Date;
};

// Database repository types
export interface UserRepository {
  createUser(data: CreateUserData): Promise<User>;
  findUserByUsername(username: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserByProvider(provider: AuthProvider, providerId: string): Promise<User | null>;
  updateUser(id: string, updates: Partial<User>): Promise<User | null>;
  updateUserLoginAt(id: string): Promise<void>;
  listUsers(): Promise<Partial<User>[]>;
}

export interface TokenRepository {
  addRefreshToken(data: { userId: string; hash: string; issuedAt: Date }): Promise<void>;
  revokeRefreshToken(data: { userId: string; hash: string }): Promise<void>;
  isRefreshTokenActive(data: { userId: string; hash: string }): Promise<boolean>;
  revokeAllUserRefreshTokens(userId: string): Promise<void>;
}

export interface TraktRepository {
  upsertTraktTokens(data: {
    userId: string;
    access_token: string;
    refresh_token: string;
    expires_at: Date;
  }): Promise<void>;
  getTraktTokens(userId: string): Promise<TraktTokens | null>;
  deleteTraktTokens(userId: string): Promise<void>;
}

export interface ListRepository {
  getLists(userId: string): Promise<ListConfig[]>;
  saveLists(userId: string, lists: Partial<ListConfig>[]): Promise<void>;
}

// Service types
export interface AuthService {
  hashPassword(password: string): Promise<string>;
  createUser(data: CreateUserData): Promise<User>;
  login(data: { username: string; password: string }): Promise<User | null>;
  verifyAndMaybeMigrate(data: { user: User; plain: string }): Promise<boolean>;
}

// Middleware types
export type MiddlewareFunction = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

export type AsyncMiddlewareFunction = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise<void>;

// Error types
export interface AppError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

export interface ValidationError extends AppError {
  field?: string;
  value?: any;
}

// Monitor types
export interface DatabaseStatus {
  status: 'healthy' | 'warning' | 'error';
  lastMetricsUpdate?: string;
  summary: {
    totalUsers: number;
    activeUsers: number;
    activeTokens: number;
    cacheHitRatio?: string;
  };
  maintenance: {
    cleanupEnabled: boolean;
    lastCleanup?: string;
    nextCleanup?: string;
  };
  error?: string;
  lastKnownGood?: string;
}

export interface PerformanceAlert {
  type: string;
  value: number;
  threshold: number;
  message: string;
}

export interface MaintenanceResult {
  timestamp: string;
  operations: string[];
  success: boolean;
}