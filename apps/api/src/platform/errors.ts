export type ErrorKind =
  'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'invalid' | 'unprocessable'

/** A refusal named by the domain; the HTTP layer decides how it is sent. */
export class DomainError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    /** Replaces the kind's generic title when the message is what the client shows. */
    readonly title?: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}
