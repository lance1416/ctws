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

/** Changing the password needs the current one, and it was not that. */
export class WrongPasswordError extends DomainError {
  constructor() {
    super('forbidden', {
      type: 'urn:ctws:problem:wrong-password',
      title: 'That is not your current password',
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

/** The handle is another account's; handles are one per instance, whatever the case. */
export class UsernameTakenError extends DomainError {
  constructor() {
    super('conflict', {
      type: 'urn:ctws:problem:username-taken',
      title: 'That username is taken.',
    })
  }
}

/** All three parts of the account's name emptied at once. */
export class NameRequiredError extends DomainError {
  constructor() {
    super('unprocessable', {
      type: 'urn:ctws:problem:name-required',
      title: 'A name needs at least one part.',
    })
  }
}
