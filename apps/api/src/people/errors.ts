/** Not in this workspace, soft-deleted, or never existed. One answer for all three. */
export class PersonNotFoundError extends Error {
  constructor() {
    super('No such person')
    this.name = 'PersonNotFoundError'
  }
}
