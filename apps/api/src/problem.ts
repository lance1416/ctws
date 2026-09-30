import type { FastifyReply } from 'fastify'
import type { Problem } from '@ctws/contracts'

export function sendProblem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
): void {
  const body: Problem = { type: 'about:blank', title, status, ...(detail ? { detail } : {}) }
  reply.status(status).type('application/problem+json').send(body)
}
