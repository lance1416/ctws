/**
 * What a refusal is, which decides its status: 400 a request in the wrong form, 422 one in the
 * right form that cannot hold, 409 one the current state refuses.
 */
export type ErrorKind =
  'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'invalid' | 'unprocessable'

/**
 * Everything of a refusal the client sees; nothing else of the error is sent. Most refusals are
 * the plain problem for their status and say what went wrong in `detail`. One the client tells
 * apart by name has its own `type`, and with it its own `title`.
 */
export type Shown = { detail: string } | { type: `urn:ctws:problem:${string}`; title: string }

/** A refusal named by the domain; the HTTP layer decides how it is sent. */
export class DomainError extends Error {
  constructor(
    readonly kind: ErrorKind,
    readonly shown: Shown,
  ) {
    super('detail' in shown ? shown.detail : shown.title)
    this.name = new.target.name
  }
}

/**
 * Missing, deleted or in another workspace: the three read the same, so ids cannot be probed.
 * `entity` is what the client asked for, such as "Task".
 */
export class NotFound extends DomainError {
  constructor(readonly entity: string) {
    super('not-found', { detail: `${entity} not found` })
  }
}
