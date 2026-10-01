import { describe, expect, it } from 'vitest'
import { adminCreateUserBody, adminUpdateUserBody, adminUser } from './admin'

const create = {
  email: 'a@b.com',
  password: 'correct horse battery',
  timezone: 'UTC',
  role: 'member',
}

describe('adminCreateUserBody', () => {
  it('accepts a valid payload', () => {
    expect(adminCreateUserBody.safeParse(create).success).toBe(true)
  })
  it('requires an explicit, known role', () => {
    expect(adminCreateUserBody.safeParse({ ...create, role: undefined }).success).toBe(false)
    expect(adminCreateUserBody.safeParse({ ...create, role: 'root' }).success).toBe(false)
  })
  it('rejects unknown keys', () => {
    expect(adminCreateUserBody.safeParse({ ...create, extra: 1 }).success).toBe(false)
  })
})

describe('adminUpdateUserBody', () => {
  it('accepts role, disabled, or both', () => {
    expect(adminUpdateUserBody.safeParse({ role: 'admin' }).success).toBe(true)
    expect(adminUpdateUserBody.safeParse({ disabled: true }).success).toBe(true)
    expect(adminUpdateUserBody.safeParse({ role: 'member', disabled: false }).success).toBe(true)
  })
  it('rejects an empty patch and unknown keys', () => {
    expect(adminUpdateUserBody.safeParse({}).success).toBe(false)
    expect(adminUpdateUserBody.safeParse({ email: 'x@y.com' }).success).toBe(false)
  })
})

describe('adminUser', () => {
  const row = {
    id: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f',
    email: 'a@b.com',
    role: 'admin',
    disabledAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  it('accepts a row and rejects extra fields such as a password hash', () => {
    expect(adminUser.safeParse(row).success).toBe(true)
    expect(adminUser.safeParse({ ...row, passwordHash: 'x' }).success).toBe(false)
  })
})
