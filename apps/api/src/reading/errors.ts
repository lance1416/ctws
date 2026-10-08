/** The item is not in this workspace, is soft-deleted, or does not exist. One answer for all three. */
export class ReadingItemNotFoundError extends Error {
  constructor() {
    super('No such reading item')
    this.name = 'ReadingItemNotFoundError'
  }
}

/**
 * A field that belongs to the other kind: a url on a book, an author on a link.
 *
 * `kind` is not patchable (a link does not become a book), so this is the client asking for a row
 * shape that cannot exist rather than a transition that is merely unsupported.
 */
export class WrongKindError extends Error {
  constructor(field: string, kind: string) {
    super(`A ${kind} has no ${field}`)
    this.name = 'WrongKindError'
  }
}
