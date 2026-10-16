import { MAX_TASK_DEPTH } from '@ctws/contracts'
import { DomainError } from '../../platform/errors'

/** The new edge would close a loop; a task waiting for itself is the shortest one. */
export class DependencyCycleError extends DomainError {
  constructor() {
    super('conflict', { detail: 'That would make two tasks wait for each other' })
  }
}

export class DepthLimitError extends DomainError {
  constructor() {
    super('conflict', { detail: `Tasks can be nested at most ${MAX_TASK_DEPTH} levels deep` })
  }
}

/** The destination is the moved task or one of its descendants. */
export class MoveCycleError extends DomainError {
  constructor() {
    super('conflict', {
      detail: 'A task cannot be moved under itself or one of its own descendants',
    })
  }
}

/** A move that names both neighbours: the request cannot say where the task goes. */
export class BothNeighboursError extends DomainError {
  constructor() {
    super('invalid', { detail: 'Give at most one of beforeId and afterId' })
  }
}

/** A neighbour that is not a live sibling at the destination. */
export class InvalidNeighbourError extends DomainError {
  constructor() {
    super('invalid', {
      detail: 'The neighbour is not a live sibling at the destination',
    })
  }
}
