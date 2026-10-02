/**
 * Raised when a task does not exist, is soft-deleted, or belongs to another workspace. One error
 * on purpose, for the same reason as `ProjectNotFoundError`: ids must not be probeable.
 */
export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found')
    this.name = 'TaskNotFoundError'
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
