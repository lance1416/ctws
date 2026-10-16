import { DomainError } from '../../platform/errors'

export class EmailTakenError extends DomainError {
  constructor() {
    super('conflict', {
      type: 'urn:ctws:problem:email-taken',
      title: 'That email is already registered',
    })
  }
}

export class RegistrationClosedError extends DomainError {
  constructor() {
    super('forbidden', {
      type: 'urn:ctws:problem:registration-closed',
      title: 'Registration is closed',
    })
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('unauthenticated', {
      type: 'urn:ctws:problem:invalid-credentials',
      title: 'Invalid email or password',
    })
  }
}

export class SessionRequiredError extends DomainError {
  constructor() {
    super('unauthenticated', {
      type: 'urn:ctws:problem:session-required',
      title: 'Authentication required',
    })
  }
}
