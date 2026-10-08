/** Not in this workspace, soft-deleted, or never existed. One answer for all three. */
export class MeetingNotFoundError extends Error {
  constructor() {
    super('No such meeting')
    this.name = 'MeetingNotFoundError'
  }
}

/**
 * A `RECURRENCE-ID` the rule never produced.
 *
 * It names no occurrence however well-formed it looks, and acting on it would write an override
 * that nothing ever reads -- a schedule nobody can see.
 */
export class OccurrenceNotFoundError extends Error {
  constructor() {
    super('No such occurrence of this meeting')
    this.name = 'OccurrenceNotFoundError'
  }
}

/**
 * A rule the expander cannot use.
 *
 * The expander is what has to understand a rule, so it is what decides: a schema that accepted
 * what the expansion then ignored would store a schedule that never happens.
 */
export class BadRuleError extends Error {
  constructor(why = 'That repeat rule schedules nothing') {
    super(why)
    this.name = 'BadRuleError'
  }
}

/**
 * An edit aimed at ONE occurrence that changes something only a series has.
 *
 * A title, a location, a guest list and a project belong to the series: moving one week's meeting
 * is not a reason for the series to have two titles. Only the time and the length of a single
 * occurrence can differ from its series, which is also exactly what `RECURRENCE-ID` overrides are
 * used for in practice.
 */
export class OneOccurrenceLimitError extends Error {
  constructor() {
    super('Only the time or the length of a single occurrence can differ from its series')
    this.name = 'OneOccurrenceLimitError'
  }
}
