// src/services/auth.ts
import { repo } from '../db/repo';
import { hashPassword, comparePassword } from '../utils/password';
import { User, CreateUserData, AuthService, UserRole, AuthProvider } from '../types';

export async function verifyAndMaybeMigrate({ user, plain }: { user: User; plain: string }): Promise<boolean> {
  const digest = user.password_hash;
  if (!digest) return false;

  // Try to verify with the current hash
  const isValid = await comparePassword(plain, digest);
  if (!isValid) return false;

  // If it's an old bcrypt hash, migrate to Argon2
  if (digest.startsWith('$2')) {
    try {
      const newHash = await hashPassword(plain);
      // Update user with new hash (implement updateUserPasswordHash if needed)
      if (typeof repo.updateUser === 'function') {
        await repo.updateUser(user.id, { password_hash: newHash });
      }
    } catch (error) {
      // Log error but don't fail authentication
      console.error('Password migration failed:', error);
    }
  }

  return true;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;
  const createdUser = await (repo as any).createUser({ 
    username: data.username,
    email: data.email,
    passwordHash,
    role: data.role || 'user',
    provider: data.provider || 'local',
    provider_id: data.provider_id || null,
    avatar_url: data.avatar_url || null,
    email_verified: data.email_verified || false
  });
  
  // Transform the created user to match the User interface
  return {
    id: createdUser.id,
    username: createdUser.username,
    email: createdUser.email,
    password_hash: createdUser.passwordHash,
    role: createdUser.role as UserRole,
    provider: createdUser.provider as AuthProvider,
    provider_id: createdUser.provider_id || undefined,
    avatar_url: createdUser.avatar_url || undefined,
    email_verified: createdUser.email_verified,
    manifest_version: 1,
    created_at: new Date(createdUser.createdAt || Date.now()),
    updated_at: new Date(createdUser.updatedAt || Date.now())
  };
}

export async function login({ username, password }: { username: string; password: string }): Promise<User | null> {
  const user = await repo.findUserByUsername(username);
  if (!user) return null;
  
  const isValid = await verifyAndMaybeMigrate({ user, plain: password });
  if (!isValid) return null;
  
  await repo.updateUserLoginAt(user.id).catch(() => {});
  return user;
}

const authService: AuthService = {
  hashPassword,
  createUser,
  login,
  verifyAndMaybeMigrate
};

export default authService;