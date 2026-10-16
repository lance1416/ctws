import type { Problem } from '@ctws/contracts'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { isCheckViolation } from '../db/sql'
import { DomainError, type ErrorKind } from '../errors'
import { plainProblem, sendProblem } from './problem'

const STATUS: Record<ErrorKind, number> = {
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
  invalid: 400,
  unprocessable: 422,
}

/** Exactly what the error declares it shows, at its kind's status. */
export function problemOf(error: DomainError): Problem {
  const status = STATUS[error.kind]
  const { shown } = error
  return 'detail' in shown
    ? plainProblem(status, shown.detail)
    : { type: shown.type, title: shown.title, status }
}

export function handleError(error: FastifyError, _req: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof DomainError) return sendProblem(reply, problemOf(error))
  if (hasZodFastifySchemaValidationErrors(error)) {
    return sendProblem(reply, plainProblem(400, error.message))
  }
  // A value the contract let through but a CHECK refuses: the request's fault, not the server's.
  // The constraint's own message names tables and columns, so it is not sent.
  if (isCheckViolation(error)) {
    return sendProblem(reply, plainProblem(422, 'That value is not allowed here'))
  }
  const status = error.statusCode ?? 500
  // A server error never shows its message; Fastify's own refusals (a body too large, a rate
  // limit) say theirs as the detail.
  sendProblem(reply, status >= 500 ? plainProblem(status) : plainProblem(status, error.message))
}
