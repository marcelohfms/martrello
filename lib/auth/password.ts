import { hash, verify } from '@node-rs/argon2';

// OWASP argon2id baseline; @node-rs/argon2 defaults to the argon2id variant.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
