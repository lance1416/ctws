import { STATUS_CODES } from 'node:http'
import type { FastifyReply } from 'fastify'
import type { Problem } from '@ctws/contracts'

/**
 * The plain problem for `status` (RFC 9457 `about:blank`): its title is the status's own phrase,
 * and what went wrong goes in `detail`.
 */
export function plainProblem(status: number, detail?: string): Problem {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    ...(detail ? { detail } : {}),
  }
}

export function sendProblem(reply: FastifyReply, problem: Problem): void {
  reply.status(problem.status).type('application/problem+json').send(problem)
}
