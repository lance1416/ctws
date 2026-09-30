import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/auth/password'

describe('password', () => {
  it('verifies a correct password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
  })

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery')
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false)
  })

  it('produces a different hash for the same input', async () => {
    expect(await hashPassword('same input here')).not.toBe(await hashPassword('same input here'))
  })

  it('uses argon2id', async () => {
    expect(await hashPassword('correct horse battery')).toMatch(/^\$argon2id\$/)
  })

  it('returns false rather than throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false)
  })

  it('throws rather than returning false on a non-string argument', async () => {
    // @ts-expect-error intentionally passing the wrong type
    await expect(verifyPassword(null, 'whatever')).rejects.toThrow(TypeError)
  })
})
