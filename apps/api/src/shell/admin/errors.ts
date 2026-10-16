import { DomainError } from '../../platform/errors'

export class LastAdminError extends DomainError {
  constructor() {
    super('conflict', {
      type: 'urn:ctws:problem:last-admin',
      title: 'At least one enabled admin must remain',
    })
  }
}

export class AdminRequiredError extends DomainError {
  constructor() {
    super('forbidden', { type: 'urn:ctws:problem:admin-required', title: 'Admin role required' })
  }
}
