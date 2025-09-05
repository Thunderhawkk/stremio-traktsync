# TypeScript Migration Guide

This document outlines the TypeScript migration strategy and implementation for the Stremio Trakt Multi-User application.

## 🎯 Migration Overview

The backend is being incrementally migrated from JavaScript to TypeScript to improve:
- **Type Safety**: Catch errors at compile time
- **Developer Experience**: Better IDE support and autocomplete
- **Code Quality**: Enforce consistent interfaces and contracts
- **Maintainability**: Self-documenting code with clear type definitions

## 📋 Migration Status

### ✅ Completed
- **TypeScript Configuration**: `tsconfig.json` with strict settings
- **Type Definitions**: Comprehensive types in `src/types/index.ts`
- **Core Utilities**: `jwt.ts`, `logger.ts`, `password.ts`
- **Configuration**: `config/index.ts` with typed config
- **Database Layer**: `db/pg.ts` with connection pooling types
- **Services**: `auth.ts` service with proper types
- **Middleware**: `auth.ts` middleware with type safety
- **Routes**: `auth.ts` route with typed request/response
- **Build System**: NPM scripts for TypeScript compilation
- **Main Entry**: `index.ts` with full type coverage

### 🔄 In Progress
- Database repository layer conversion
- Remaining route handlers
- OAuth2 configuration with types
- Middleware layer completion

### 📅 Planned
- Complete route handlers migration
- Service layer completion
- Job scheduler types
- Test suite with TypeScript
- Database query builder types

## 🛠 Implementation Strategy

### 1. **Incremental Migration**
```
Phase 1: Core Infrastructure ✅
├── Type definitions
├── Configuration
├── Utilities
└── Database connections

Phase 2: Business Logic 🔄
├── Services
├── Middleware
├── Routes
└── Database operations

Phase 3: Advanced Features 📅
├── Job scheduling
├── OAuth2 providers
├── Admin dashboard
└── Monitoring services
```

### 2. **Dual Operation**
- JavaScript and TypeScript versions run side-by-side
- Gradual replacement without breaking existing functionality
- Fallback to JavaScript if TypeScript compilation fails

```bash
# Run TypeScript version (development)
npm run dev

# Run JavaScript version (fallback)
npm run dev:js

# Build TypeScript for production
npm run build
npm start
```

## 📁 File Structure

```
src/
├── types/
│   ├── index.ts          # Main type definitions
│   └── express.d.ts      # Express augmentations
├── config/
│   ├── index.ts         # Typed configuration
│   └── index.js         # Original JS (kept for compatibility)
├── utils/
│   ├── jwt.ts           # JWT utilities with types
│   ├── logger.ts        # Typed logger
│   ├── password.ts      # Password utilities with types
│   └── *.js            # Original JS files (kept)
├── services/
│   ├── auth.ts         # Authentication service with types
│   └── *.js           # Other services (to be migrated)
├── middleware/
│   ├── auth.ts        # Authentication middleware with types
│   └── *.js          # Other middleware (to be migrated)
├── routes/
│   ├── auth.ts       # Auth routes with types
│   └── *.js         # Other routes (to be migrated)
├── db/
│   ├── pg.ts        # Database connection with types
│   └── *.js        # Other DB files (to be migrated)
├── index.ts        # Main TypeScript entry point
└── index.js        # Original JavaScript entry (kept)
```

## 🔧 Type System

### **Core Types**
```typescript
// User Management
interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  provider: AuthProvider;
  // ... other fields
}

// Authentication
interface JWTPayload {
  sub: string;
  username?: string;
  role?: UserRole;
  email?: string;
}

// API Responses
interface ApiResponse<T = any> {
  ok: boolean;
  error?: string;
  data?: T;
}
```

### **Express Augmentation**
```typescript
// Enhanced request object
interface AuthenticatedRequest extends Request {
  user?: User;
  session: any; // Flexible session typing
  tenantUserId?: string;
}

// Type-safe middleware
type MiddlewareFunction = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => void | Promise<void>;
```

### **Database Types**
```typescript
// Repository interfaces
interface UserRepository {
  createUser(data: CreateUserData): Promise<User>;
  findUserById(id: string): Promise<User | null>;
  // ... other methods
}

// Query optimization types
interface DatabaseMetrics {
  tableStats: any[];
  indexStats: any[];
  connectionStats: any;
}
```

## 🚀 Development Workflow

### **Development Commands**
```bash
# Start development with TypeScript
npm run dev

# Type checking without compilation
npm run type-check

# Build for production
npm run build

# Watch mode compilation
npm run build:watch
```

### **IDE Configuration**
Recommended VS Code settings:
```json
{
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "typescript.suggest.autoImports": true,
  "typescript.preferences.includePackageJsonAutoImports": "auto",
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

## 🔍 Type Safety Features

### **Strict Configuration**
```json
{
  "strict": true,
  "noImplicitAny": true,
  "noImplicitReturns": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true
}
```

### **Runtime Type Validation**
- Integration with Zod for request validation
- Type-safe database operations
- Compile-time route parameter validation

### **Error Handling**
```typescript
// Type-safe error handling
interface AppError extends Error {
  status?: number;
  code?: string;
  details?: any;
}

// Middleware with proper error types
const errorHandler = (
  err: AppError,
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Type-safe error handling
};
```

## 📊 Benefits Achieved

### **Development Experience**
- **Autocomplete**: Full IntelliSense support
- **Refactoring**: Safe renaming and code changes
- **Documentation**: Self-documenting interfaces
- **Error Prevention**: Catch issues before runtime

### **Code Quality**
- **Consistency**: Enforced interfaces across modules
- **Maintainability**: Clear contracts between components
- **Testing**: Better test coverage with typed mocks
- **Performance**: Compile-time optimizations

### **Production Reliability**
- **Type Safety**: Reduced runtime errors
- **API Contracts**: Guaranteed request/response shapes
- **Database Integrity**: Typed database operations
- **Configuration**: Type-safe environment handling

## 🔄 Migration Process

### **Converting a JavaScript File**

1. **Create TypeScript version**:
```bash
cp src/routes/example.js src/routes/example.ts
```

2. **Add type imports**:
```typescript
import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest, User } from '../types';
```

3. **Add type annotations**:
```typescript
// Before (JavaScript)
function middleware(req, res, next) {
  // ...
}

// After (TypeScript)
function middleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // ...
}
```

4. **Update package.json scripts**:
```json
{
  "dev": "ts-node src/index.ts",
  "dev:js": "node src/index.js"
}
```

### **Testing the Migration**
```bash
# Type check
npm run type-check

# Run development server
npm run dev

# Build for production
npm run build
```

## 🎯 Next Steps

1. **Complete Core Migration**:
   - Finish remaining route handlers
   - Convert all middleware
   - Migrate database repositories

2. **Advanced Features**:
   - Add comprehensive error types
   - Implement request validation schemas
   - Create typed API documentation

3. **Testing Integration**:
   - Set up Jest with TypeScript
   - Create typed test utilities
   - Add integration test types

4. **Production Deployment**:
   - Optimize build process
   - Add source maps
   - Configure monitoring with types

---

*TypeScript migration is an ongoing process that improves code quality and developer experience while maintaining backward compatibility.*