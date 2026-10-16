import { DomainError } from '../../platform/errors'

/** A repeat rule the expander cannot use. */
export class BadRuleError extends DomainError {
  constructor(why = 'That repeat rule schedules nothing') {
    super('unprocessable', { detail: why })
  }
}

/** A meeting that happens once has no occurrences after its one to change. */
export class OnceOnlyError extends DomainError {
  constructor() {
    super('unprocessable', {
      detail: 'This meeting happens once, so there is nothing after it to change',
    })
  }
}
