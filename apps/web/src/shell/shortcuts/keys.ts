import type { KeyTable } from '../../platform/keyboard/keyTable'
import type { Chord } from '../contract'
import { JUMP_PREFIX } from './chords'

export type AnywhereAction = 'capture' | 'search' | 'help' | 'sidebar' | 'jump'

/**
 * The keys that work on every page (FR-029). A jump is the prefix and then a chord's own key, so
 * each chord is a line of its own, and the prefix is the press that starts any of them.
 */
export function anywhereKeys(chords: readonly Chord[]): KeyTable<AnywhereAction> {
  return {
    title: 'Anywhere',
    rows: [
      {
        keys: 'Ctrl K',
        does: 'Search, or go to a page',
        presses: { 'Ctrl+k': 'search', 'Meta+k': 'search' },
      },
      { keys: 'C', does: 'Capture a thought or a link', presses: { c: 'capture' } },
      { keys: '?', does: 'This list of keys', presses: { '?': 'help' } },
      { keys: '[', does: 'Hide or show the sidebar', presses: { '[': 'sidebar' } },
      ...chords.map((c) => ({
        keys: `${JUMP_PREFIX.toUpperCase()} ${c.key.toUpperCase()}`,
        does: c.label,
        presses: { [JUMP_PREFIX]: 'jump' as const },
      })),
      { keys: 'Esc', does: 'Close the inspector or an overlay', presses: {} },
    ],
  }
}
