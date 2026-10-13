import { DomainError } from '../../platform/errors'

/** Missing, deleted or in another workspace: the three read the same so ids cannot be probed. */
export class ProjectNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'Project not found')
  }
}

/** The inbox is where capture lands, so it is never deleted or archived. */
export class InboxProtectedError extends DomainError {
  constructor() {
    super('conflict', 'The inbox cannot be removed')
  }
}
