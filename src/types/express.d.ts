// src/types/express.d.ts
// Express type augmentations

import { User, UserRole, AuthProvider } from './index';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      tenantUserId?: string;
    }

    interface Session {
      user?: {
        id: string;
        username: string;
        role: UserRole;
        email?: string;
        provider?: AuthProvider;
      };
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      username: string;
      role: UserRole;
      email?: string;
      provider?: AuthProvider;
    };
  }
}

export {};