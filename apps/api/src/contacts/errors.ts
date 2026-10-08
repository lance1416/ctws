/** Not in this workspace, soft-deleted, or never existed. One answer for all three. */
export class ContactNotFoundError extends Error {
  constructor() {
    super('No such contact')
    this.name = 'ContactNotFoundError'
  }
}
