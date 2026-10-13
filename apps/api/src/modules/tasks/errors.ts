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
 * Refused because the edge would close a loop -- A waits for B which waits for A. The same error
 * covers a task asked to wait for itself: it is the shortest loop there is.
 */
export class DependencyCycleError extends Error {
  constructor() {
    super('That would make two tasks wait for each other')
    this.name = 'DependencyCycleError'
  }
}
