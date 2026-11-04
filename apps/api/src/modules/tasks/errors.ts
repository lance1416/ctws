import {
  DERIVED_PLAN_REFUSED,
  DERIVED_STATUS_REFUSED,
  MAX_TASK_DEPTH,
  WINDOW_REFUSED,
} from '@ctws/contracts'
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
    super('unprocessable', {
      detail: 'The neighbour is not a live sibling at the destination',
    })
  }
}

/** A PATCH that sets what a parent gets from its subtasks: its status or its planned day. */
export class DerivedFieldError extends DomainError {
  constructor(field: 'status' | 'scheduledOn') {
    super('unprocessable', {
      detail: field === 'status' ? DERIVED_STATUS_REFUSED : DERIVED_PLAN_REFUSED,
    })
  }
}

/** A review window whose start falls after its end, the default end included. */
export class InvertedWindowError extends DomainError {
  constructor() {
    super('invalid', { detail: WINDOW_REFUSED })
  }
}

/** A parent takes its status from its children, so it cannot come round on its own. */
export class RepeatOnParentError extends DomainError {
  constructor() {
    super('unprocessable', {
      type: 'urn:ctws:problem:repeat-on-parent',
      title: 'A task with subtasks cannot repeat.',
    })
  }
}

/** A repeating task stays a leaf: under it, its next one would have to copy its children too. */
export class RepeatTakesNoChildrenError extends DomainError {
  constructor() {
    super('unprocessable', {
      type: 'urn:ctws:problem:repeat-takes-no-children',
      title: 'A repeating task cannot have subtasks.',
    })
  }
}

/** A repeat counts from a day: the planned one, or the deadline's. */
export class RepeatNeedsADateError extends DomainError {
  constructor() {
    super('unprocessable', {
      type: 'urn:ctws:problem:repeat-needs-a-date',
      title: 'A repeating task needs a planned day or a deadline.',
    })
  }
}
