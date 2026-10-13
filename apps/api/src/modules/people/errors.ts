import { DomainError } from '../../platform/errors'

export class PersonNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'No such person')
  }
}

/** A birthday on a day that does not exist; the message says why. */
export class ImpossibleBirthdayError extends DomainError {
  constructor(why: string) {
    super('invalid', why)
  }
}
