import type { CookieSerializeOptions } from '@fastify/cookie'
import type { FastifyReply } from 'fastify'
import type { Env } from '../../platform/config'

export const SESSION_COOKIE = 'ctws_session'

export function cookieOptions(env: Env, expires?: Date): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    ...(expires ? { expires } : {}),
  }
}

export function setSessionCookie(reply: FastifyReply, env: Env, id: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, id, cookieOptions(env, expiresAt))
}

export function clearSessionCookie(reply: FastifyReply, env: Env): void {
  reply.clearCookie(SESSION_COOKIE, cookieOptions(env))
}
