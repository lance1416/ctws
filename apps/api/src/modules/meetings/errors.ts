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

/**
 * One occurrence cancelled from its More menu (FR-068): not there, but not gone either, since it
 * can be taken back. Named, so its page can say so rather than call it deleted.
 */
export class OccurrenceCancelledError extends DomainError {
  constructor() {
    super('not-found', {
      type: 'urn:ctws:problem:occurrence-cancelled',
      title: 'Occurrence cancelled',
    })
  }
}
