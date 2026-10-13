import { DomainError } from '../../platform/errors'

export class EmailTakenError extends DomainError {
  constructor() {
    super('conflict', 'email already registered', 'That email is already registered')
  }
}

export class RegistrationClosedError extends DomainError {
  constructor(mode: 'closed' | 'invite') {
    super(
      'forbidden',
      'registration is closed',
      mode === 'invite' ? 'A valid invite code is required' : 'Registration is closed',
    )
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
