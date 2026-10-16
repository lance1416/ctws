import type { TaskStatus } from '@ctws/contracts'
import { pressesWith, type KeyTable } from '../../../platform/keyboard/keyTable'
import { toggleDoneTarget, toggleStartTarget } from './status'

/** `n` needs a project to create into, so it exists only on a project page. */
export const PROJECT_PAGE_KEYS: KeyTable<'create'> = {
  title: 'On a project page',
  rows: [{ keys: 'n', does: 'Open the New dialog', presses: { n: 'create' } }],
}

/** The two status keys, alike wherever a task row has focus. */
type StatusAction = 'start' | 'complete'
const STATUS_ROWS = [
  { keys: 's', does: 'Start / pause', presses: { s: 'start' } },
  { keys: 'x', does: 'Complete / reopen', presses: { x: 'complete' } },
] as const

/** What the status keys do to a task with `status`: each says the status to set. */
export const statusActions = (status: TaskStatus, set: (next: TaskStatus) => void) => ({
  start: () => set(toggleStartTarget(status)),
  complete: () => set(toggleDoneTarget(status)),
})

/** Plain Enter on a row is the button's own click, which opens the details. */
export const TODAY_KEYS: KeyTable<StatusAction> = {
  title: 'On Today (with a row focused)',
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

/** Alt, with or without any other modifier: the tree's Alt presses answer to them all. */
const ALT_ANY = { held: ['Alt'], either: ['Ctrl', 'Meta', 'Shift'] } as const

/**
 * A focused row in the tree: bare arrows move focus and fold, Alt+arrows move the row and change
 * its depth. Tab is unbound, so one Tab leaves the tree.
 */
export const TREE_KEYS: KeyTable<TreeAction> = {
  title: 'In the task tree (with a row focused)',
  rows: [
    {
      keys: '↑ ↓ / j k',
      does: 'Move between rows',
      presses: { ArrowDown: 'next', ArrowUp: 'previous', j: 'next', k: 'previous' },
    },
    {
      keys: '← →',
      does: 'Collapse / expand (once collapsed, ← goes to the parent; once expanded, → goes to the first child)',
      presses: { ArrowLeft: 'collapse', ArrowRight: 'expand' },
    },
    { keys: 'Home End', does: 'First row / last row', presses: { Home: 'first', End: 'last' } },
    { keys: 'Tab', does: 'Leave the tree (the whole tree is one tab stop)', presses: {} },
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
      does: 'Move this row up / down',
      presses: {
        ...pressesWith('ArrowUp', 'moveUp', ALT_ANY),
        ...pressesWith('ArrowDown', 'moveDown', ALT_ANY),
      },
    },
    {
      keys: 'Alt+← Alt+→',
      does: 'Outdent / indent',
      presses: {
        ...pressesWith('ArrowLeft', 'outdent', ALT_ANY),
        ...pressesWith('ArrowRight', 'indent', ALT_ANY),
      },
    },
    ...STATUS_ROWS,
  ],
}

/** The module's tables in the order the help lists them. */
export const TASK_KEYS = [PROJECT_PAGE_KEYS, TREE_KEYS, TODAY_KEYS] as const
