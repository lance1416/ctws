import { describe, expect, it } from 'vitest'
import { loginBody, registerBody, userResponse } from './auth'

const valid = { email: 'a@b.com', password: 'correct horse battery', timezone: 'Asia/Shanghai' }

describe('registerBody', () => {
  it('accepts a valid payload', () => {
    expect(registerBody.parse(valid)).toEqual(valid)
  })

  it('rejects a malformed email', () => {
    expect(registerBody.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('normalises email to lowercase and trims it', () => {
    const parsed = registerBody.parse({ ...valid, email: '  A@B.COM  ' })
    expect(parsed.email).toBe('a@b.com')
  })

  it('rejects a password shorter than 12 characters', () => {
    expect(registerBody.safeParse({ ...valid, password: 'short' }).success).toBe(false)
  })

  // An invalid timezone is refused at the boundary.
  it.each(['GMT+8', '', 'Not/AZone', 'UTC+08:00', 'asia/shanghai'])(
    'rejects invalid IANA timezone %j',
    (timezone) => {
      expect(registerBody.safeParse({ ...valid, timezone }).success).toBe(false)
    },
  )

  it.each(['UTC', 'Asia/Shanghai', 'America/New_York', 'Europe/London'])(
    'accepts valid IANA timezone %j',
    (timezone) => {
      expect(registerBody.safeParse({ ...valid, timezone }).success).toBe(true)
    },
  )

  it('rejects unknown keys', () => {
    expect(registerBody.safeParse({ ...valid, role: 'admin' }).success).toBe(false)
  })

  // When AUTH_REGISTRATION=invite, the endpoint validates its value; the schema only ensures it is an optional string
  it('accepts an optional invite code', () => {
    expect(registerBody.safeParse({ ...valid, inviteCode: 'let-me-in' }).success).toBe(true)
    expect(registerBody.safeParse(valid).success).toBe(true)
  })
})

describe('loginBody', () => {
  it('does not impose a password length rule', () => {
    // Login must not leak the password policy, nor reject because a historical password no longer meets the new rules
    expect(loginBody.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })
})

describe('userResponse', () => {
  // This project generates ids as UUIDv7 (RFC 9562); the schema must accept a real v7 value.
  it('accepts a genuine UUIDv7 id and workspaceId', () => {
    const payload = {
      id: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f',
      email: 'a@b.com',
      timezone: 'Asia/Shanghai',
      workspaceId: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f',
      role: 'member',
    }
    expect(userResponse.safeParse(payload).success).toBe(true)
  })

  it('requires a known role', () => {
    const payload = {
      id: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f',
      email: 'a@b.com',
      timezone: 'UTC',
      workspaceId: '01931b9c-5d7e-7c3a-8f2e-1a2b3c4d5e6f',
    }
    expect(userResponse.safeParse(payload).success).toBe(false)
    expect(userResponse.safeParse({ ...payload, role: 'root' }).success).toBe(false)
    for (const role of ['admin', 'maintainer', 'member']) {
      expect(userResponse.safeParse({ ...payload, role }).success).toBe(true)
    }
  })
})
