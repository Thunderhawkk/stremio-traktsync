// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types';

/**
 * Middleware to ensure user is authenticated
 */
export function authRequired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.session || !req.session.user) {
    res.status(401).json({ ok: false, error: 'authentication_required' });
    return;
  }
  next();
}

/**
 * Middleware factory to require specific role
 */
export function requireRole(requiredRole: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.session || !req.session.user) {
      res.status(401).json({ ok: false, error: 'authentication_required' });
      return;
    }

    const userRole = req.session.user.role;
    
    // Admin can access everything
    if (userRole === 'admin') {
      next();
      return;
    }

    // Check specific role requirement
    if (userRole !== requiredRole) {
      res.status(403).json({ ok: false, error: 'insufficient_permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware to attach user from session to request
 */
export function attachUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.session && req.session.user) {
    // User object is already in session, no need to fetch from DB for basic auth
    // For full user object, services can fetch from DB using req.session.user.id
  }
  next();
}

/**
 * Middleware to ensure user owns resource or is admin
 */
export function requireOwnershipOrAdmin(userIdParam: string = 'userId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.session || !req.session.user) {
      res.status(401).json({ ok: false, error: 'authentication_required' });
      return;
    }

    const sessionUserId = req.session.user.id;
    const resourceUserId = req.params[userIdParam];
    const userRole = req.session.user.role;

    // Admin can access any resource
    if (userRole === 'admin') {
      next();
      return;
    }

    // User can only access their own resources
    if (sessionUserId !== resourceUserId) {
      res.status(403).json({ ok: false, error: 'access_denied' });
      return;
    }

    next();
  };
}