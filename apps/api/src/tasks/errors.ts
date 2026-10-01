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
