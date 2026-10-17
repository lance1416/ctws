import type { FastifyReply } from 'fastify'

/**
 * Lets any cache keep an answer for a day: for one that is the same for every account and changes
 * only with a deploy.
 */
export const cacheForADay = (reply: FastifyReply): void => {
  reply.header('cache-control', 'public, max-age=86400')
}
