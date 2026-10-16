import { DomainError } from '../../platform/errors'

/** A field of the other kind: a url on a book, an author on a link. */
export class WrongKindError extends DomainError {
  constructor(field: string, kind: string) {
    super('unprocessable', { detail: `A ${kind} has no ${field}` })
  }
}
