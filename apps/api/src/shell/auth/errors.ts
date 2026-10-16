import { DomainError } from '../../platform/errors'

export class EmailTakenError extends DomainError {
  constructor() {
    super('conflict', 'email already registered', 'That email is already registered')
  }
}

export class RegistrationClosedError extends DomainError {
  constructor() {
    super('forbidden', 'registration is closed', 'Registration is closed')
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('unauthenticated', 'invalid credentials', 'Invalid email or password')
  }
}

export class SessionRequiredError extends DomainError {
  constructor() {
    super('unauthenticated', 'no valid session')
  }
}
