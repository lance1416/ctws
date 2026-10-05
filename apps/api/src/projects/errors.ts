/**
 * Raised when a project does not exist, is soft-deleted, or belongs to another workspace. The
 * three cases are deliberately one error: telling them apart would let a caller probe which
 * project ids exist in workspaces they cannot see.
 */
export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found')
    this.name = 'ProjectNotFoundError'
  }
}

/**
 * The inbox is quick capture's destination; deleting or archiving it would break capture for the
 * workspace.
 */
export class InboxNotDeletableError extends Error {
  constructor() {
    super('The inbox cannot be removed')
    this.name = 'InboxNotDeletableError'
  }
}
