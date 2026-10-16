import { DomainError } from '../../platform/errors'

/** A birthday on a day that does not exist; the detail says why. */
export class ImpossibleBirthdayError extends DomainError {
  constructor(why: string) {
    super('invalid', { detail: why })
  }
}
