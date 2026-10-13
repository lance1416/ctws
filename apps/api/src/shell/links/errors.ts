import { DomainError } from '../../platform/errors'

/** An end of a link that does not exist in this workspace. */
export class LinkEndNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'No such object')
  }
}

/** A kind of link the model does not allow between these two types. */
export class UnknownLinkError extends DomainError {
  constructor() {
    super('invalid', 'that is not a kind of link')
  }
}
