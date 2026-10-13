import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { DomainError, type ErrorKind } from '../errors'
import { sendProblem } from './problem'

const KINDS: Record<ErrorKind, { status: number; title: string; detail: boolean }> = {
  unauthenticated: { status: 401, title: 'Authentication required', detail: false },
  forbidden: { status: 403, title: 'Forbidden', detail: true },
  'not-found': { status: 404, title: 'Not Found', detail: false },
  conflict: { status: 409, title: 'Conflict', detail: true },
  invalid: { status: 400, title: 'Bad Request', detail: true },
  unprocessable: { status: 422, title: 'Unprocessable Entity', detail: true },
}

export function problemOf(error: DomainError): { status: number; title: string; detail?: string } {
  const kind = KINDS[error.kind]
  if (error.title !== undefined) return { status: kind.status, title: error.title }
  if (!kind.detail) return { status: kind.status, title: kind.title }
  return { status: kind.status, title: kind.title, detail: error.message }
}

export function handleError(error: FastifyError, _req: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof DomainError) {
    const p = problemOf(error)
    return sendProblem(reply, p.status, p.title, p.detail)
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    return sendProblem(reply, 400, 'Bad Request', error.message)
  }
  const status = error.statusCode ?? 500
  // A server error never shows its message.
  if (status >= 500) return sendProblem(reply, status, 'Internal Server Error')
  sendProblem(reply, status, error.message)
}
