import { DomainError } from '../../platform/errors'

/** The inbox is where capture lands, so it is never deleted or archived. */
export class InboxProtectedError extends DomainError {
  constructor() {
    super('conflict', { detail: 'The inbox cannot be removed' })
  }
}
