import { DomainError } from '../../platform/errors'

export class MeetingNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'No such meeting')
  }
}

/** A recurrence id the rule never produced. */
export class OccurrenceNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'No such occurrence of this meeting')
  }
}

/** A repeat rule the expander cannot use. */
export class BadRuleError extends DomainError {
  constructor(why = 'That repeat rule schedules nothing') {
    super('unprocessable', why)
  }
}

/** Only the time and the length of one occurrence may differ from its series. */
export class OneOccurrenceLimitError extends DomainError {
  constructor() {
    super(
      'conflict',
      'Only the time or the length of a single occurrence can differ from its series',
    )
  }
}
