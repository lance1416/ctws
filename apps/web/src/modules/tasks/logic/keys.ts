import type { TaskStatus } from '@ctws/contracts'
import { pressesWith, type KeyTable } from '../../../platform/keyboard/keyTable'
import { type StatusMove, toggleDoneTarget, toggleStartTarget } from './status'

/** The two status keys, alike wherever a task row has focus. */
type StatusAction = 'start' | 'complete'
const STATUS_ROWS = [
  { keys: 'S', does: 'Start or pause', presses: { s: 'start' } },
  { keys: 'X', does: 'Complete or reopen', presses: { x: 'complete' } },
] as const

/** What the status keys do to a task with `status`: each says the status to set. */
export const statusActions = (status: TaskStatus, set: (next: StatusMove) => void) => ({
  start: () => set(toggleStartTarget(status)),
  complete: () => set(toggleDoneTarget(status)),
})

/** Where a task row's keys are listed (artboard 24): Today's rows answer to the tree's keys. */
const ROW_KEYS_TITLE = 'In a tree or list, with a row focused'

/** Plain Enter on a row is the button's own click, which opens the details. */
export const TODAY_KEYS: KeyTable<StatusAction> = {
  title: ROW_KEYS_TITLE,
  rows: [...STATUS_ROWS, { keys: 'Enter', does: 'Open the details', presses: {} }],
}

export type TreeAction =
  | StatusAction
  | 'next'
  | 'previous'
  | 'first'
  | 'last'
  | 'expand'
  | 'collapse'
  | 'open'
  | 'addSibling'
  | 'addChild'
  | 'moveUp'
  | 'moveDown'
  | 'outdent'
  | 'indent'
  | 'moveTo'

/** Alt, with or without any other modifier: the tree's Alt presses answer to them all. */
const ALT_ANY = { held: ['Alt'], either: ['Ctrl', 'Meta', 'Shift'] } as const

/**
 * A focused row in the tree: bare arrows move focus and fold, Alt+arrows move the row and change
 * its depth. Tab is unbound, so one Tab leaves the tree.
 */
export const TREE_KEYS: KeyTable<TreeAction> = {
  title: ROW_KEYS_TITLE,
  rows: [
    {
      keys: '↑ ↓ or J K',
      does: 'Move between rows',
      presses: { ArrowDown: 'next', ArrowUp: 'previous', j: 'next', k: 'previous' },
    },
    {
      keys: '← →',
      does: 'Fold, or go to the parent',
      presses: { ArrowLeft: 'collapse', ArrowRight: 'expand' },
    },
    { keys: 'Home End', does: 'First or last row', presses: { Home: 'first', End: 'last' } },
    // Enter opens the detail (the keyboard way in), so a sibling is Shift+Enter. Ctrl and Meta
    // change none of the three.
    {
      keys: 'Enter',
      does: 'Open the details',
      presses: pressesWith('Enter', 'open', { either: ['Ctrl', 'Meta'] }),
    },
    {
      keys: 'Shift+Enter',
      does: 'Add a sibling',
      presses: pressesWith('Enter', 'addSibling', { held: ['Shift'], either: ['Ctrl', 'Meta'] }),
    },
    {
      keys: 'Alt+Enter',
      does: 'Add a subtask',
      presses: pressesWith('Enter', 'addChild', ALT_ANY),
    },
    {
      keys: 'Alt+↑ Alt+↓',
      does: 'Move the row',
      presses: {
        ...pressesWith('ArrowUp', 'moveUp', ALT_ANY),
        ...pressesWith('ArrowDown', 'moveDown', ALT_ANY),
      },
    },
    {
      keys: 'Alt+← Alt+→',
      does: 'Outdent or indent',
      presses: {
        ...pressesWith('ArrowLeft', 'outdent', ALT_ANY),
        ...pressesWith('ArrowRight', 'indent', ALT_ANY),
      },
    },
    ...STATUS_ROWS,
    // The inbox's rows only (FR-059): the picker its rows' Move to… opens.
    { keys: 'M', does: 'Move to a project, in the inbox', presses: { m: 'moveTo' } },
  ],
}

/** The module's tables in the order the help lists them. */
export const TASK_KEYS = [TREE_KEYS, TODAY_KEYS] as const
