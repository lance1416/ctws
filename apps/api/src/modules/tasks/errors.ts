import { DomainError } from '../../platform/errors'
import { MAX_DEPTH } from './tree'

/** Missing, deleted or in another workspace: the three read the same so ids cannot be probed. */
export class TaskNotFoundError extends DomainError {
  constructor() {
    super('not-found', 'Task not found')
  }
}

/** The new edge would close a loop; a task waiting for itself is the shortest one. */
export class DependencyCycleError extends DomainError {
  constructor() {
    super('conflict', 'That would make two tasks wait for each other')
  }
}

export class DepthLimitError extends DomainError {
  constructor() {
    super('conflict', `Tasks can be nested at most ${MAX_DEPTH} levels deep`)
  }
}

export class ManualProgressOnParentError extends DomainError {
  constructor() {
    super('conflict', 'Manual progress can only be set on a task without children')
  }
}

/** The destination is the moved task or one of its descendants. */
export class MoveCycleError extends DomainError {
  constructor() {
    super('conflict', 'A task cannot be moved under itself or one of its own descendants')
  }
}

/** Both neighbours given, or a neighbour that is not a live sibling at the destination. */
export class InvalidNeighbourError extends DomainError {
  constructor(message: string) {
    super('invalid', message)
  }
}

export class InvalidCursorError extends DomainError {
  constructor() {
    super('invalid', 'Invalid cursor')
  }
}
