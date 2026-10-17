import type { FastifyReply } from 'fastify'

/**
 * Lets the browser keep an answer for a day: for one that is the same for every account and changes
 * only with a deploy. Private, not public: it is sent behind a session, and the session's renewed
 * cookie may ride on it, which no shared cache may keep.
 */
export const cacheForADay = (reply: FastifyReply): void => {
  reply.header('cache-control', 'private, max-age=86400')
}
