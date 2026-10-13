import { DomainError } from '../../platform/errors'

export class ReadingItemNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'No such reading item')
  }
}

/** A field of the other kind: a url on a book, an author on a link. */
export class WrongKindError extends DomainError {
  constructor(field: string, kind: string) {
    super('conflict', `A ${kind} has no ${field}`)
  }
}
