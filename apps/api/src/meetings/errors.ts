/** Not in this workspace, soft-deleted, or never existed. One answer for all three. */
export class MeetingNotFoundError extends Error {
  constructor() {
    super('No such meeting')
    this.name = 'MeetingNotFoundError'
  }
}

/**
 * A meeting that would end before it starts.
 *
 * The contract refuses this when it is sent both ends, but moving only the START is checked
 * against the stored end, which only the server knows -- so the rule lives here as well.
 */
export class BackwardsMeetingError extends Error {
  constructor() {
    super('A meeting has to end after it starts')
    this.name = 'BackwardsMeetingError'
  }
}
