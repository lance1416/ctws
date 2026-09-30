import { hash, verify } from '@node-rs/argon2'

// @node-rs/argon2 rather than argon2: the latter needs a node-gyp native
// build, which is a recurring source of friction on Windows dev machines;
// the former ships precompiled binaries. argon2id is the default algorithm.
export function hashPassword(plain: string): Promise<string> {
  return hash(plain)
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  // A non-string argument is a programming error (wrong call shape), not a
  // failed login attempt, so let it throw instead of masking it as `false`.
  if (typeof storedHash !== 'string' || typeof plain !== 'string') {
    throw new TypeError('verifyPassword expects storedHash and plain to be strings')
  }

  try {
    return await verify(storedHash, plain)
  } catch {
    // Only argon2's own parsing/verification of the stored hash lands here
    // (inputs are already known to be strings), so this is a corrupt or
    // malformed stored hash. That is indistinguishable in outcome from a
    // wrong password, so it should not crash the caller.
    return false
  }
}
