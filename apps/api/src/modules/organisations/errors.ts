import { DomainError } from '../../platform/errors'

/** A merge whose two sides are the same organisation. */
export class MergeIntoItself extends DomainError {
  constructor() {
    super('invalid', { detail: 'an organisation cannot be merged into itself' })
  }
}
