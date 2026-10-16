import { hash, verify } from '@node-rs/argon2'

// @node-rs/argon2 ships prebuilt binaries, so no native build; argon2id is its default.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain)
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain)
  } catch {
    // A malformed stored hash fails like a wrong password.
    return false
  }
}
