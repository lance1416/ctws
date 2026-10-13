import { DomainError } from '../../platform/errors'

export class UserNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'user not found', 'User not found')
  }
}

export class LastAdminError extends DomainError {
  constructor() {
    super(
      'conflict',
      'at least one enabled admin must remain',
      'At least one enabled admin must remain',
    )
  }
}

export class AdminRequiredError extends DomainError {
  constructor() {
    super('forbidden', 'admin role required', 'Admin role required')
  }
}
