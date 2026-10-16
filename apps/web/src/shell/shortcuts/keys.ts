import type { KeyTable } from '../../platform/keyboard/keyTable'
import type { Chord } from '../contract'
import { JUMP_PREFIX } from './chords'

export type AnywhereAction = 'capture' | 'search' | 'help' | 'jump'

/**
 * The keys that work on every page. A jump is the prefix and then a chord's own key, so each chord
 * is a line of its own, and the prefix is the press that starts any of them.
 */
export function anywhereKeys(chords: readonly Chord[]): KeyTable<AnywhereAction> {
  return {
    title: 'Anywhere',
    rows: [
      { keys: '/', does: 'Jump to the capture box', presses: { '/': 'capture' } },
      { keys: 'f', does: 'Search, or go to a page', presses: { f: 'search' } },
      { keys: '?', does: 'This list of shortcuts', presses: { '?': 'help' } },
      ...chords.map((c) => ({
        keys: `${JUMP_PREFIX} ${c.key}`,
        does: c.label,
        presses: { [JUMP_PREFIX]: 'jump' as const },
      })),
      { keys: 'Esc', does: 'Close the pane or overlay', presses: {} },
    ],
  }
}
