// src/utils/password.ts
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';

const ARGON_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: Number(process.env.ARGON_MEMORY_KIB || 64 * 1024),
  timeCost: Number(process.env.ARGON_TIME || 2),
  parallelism: Number(process.env.ARGON_PARALLEL || 1)
};

function isArgonHash(h: string): boolean {
  return typeof h === 'string' && h.startsWith('$argon2');
}

function isBcryptHash(h: string): boolean {
  return typeof h === 'string' && h.startsWith('$2');
}

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length < 8) {
    throw new Error('weak_password');
  }
  return argon2.hash(plain, ARGON_OPTS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;

  if (isArgonHash(hash)) {
    return argon2.verify(hash, plain, ARGON_OPTS);
  }
  
  if (isBcryptHash(hash)) {
    return bcrypt.compare(plain, hash);
  }
  
  return false;
}