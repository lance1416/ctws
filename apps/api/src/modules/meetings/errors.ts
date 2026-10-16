import { DomainError } from '../../platform/errors'

/** A repeat rule the expander cannot use. */
export class BadRuleError extends DomainError {
  constructor(why = 'That repeat rule schedules nothing') {
    super('unprocessable', { detail: why })
  }
}

/** Only the time and the length of one occurrence may differ from its series. */
export class OneOccurrenceLimitError extends DomainError {
  constructor() {
    super('unprocessable', {
      detail: 'Only the time or the length of a single occurrence can differ from its series',
    })
  }
}
