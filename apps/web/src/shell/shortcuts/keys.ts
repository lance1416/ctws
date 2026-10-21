import type { KeyTable } from '../../platform/keyboard/keyTable'
import type { Chord, Creator } from '../contract'
import { JUMP_PREFIX, NEW_PREFIX } from './chords'

export type AnywhereAction = 'capture' | 'search' | 'help' | 'sidebar' | 'jump' | 'link' | 'new'

/**
 * The keys that work on every page (FR-029). A jump is the prefix and then a chord's own key, so
 * each chord is a line of its own, and the prefix is the press that starts any of them.
 */
export function anywhereKeys(
  chords: readonly Chord[],
  creates: readonly Creator[] = [],
): KeyTable<AnywhereAction> {
  return {
    title: 'Anywhere',
    rows: [
      {
        keys: 'Ctrl+K',
        does: 'Search, or go to any page',
        presses: { 'Ctrl+k': 'search', 'Meta+k': 'search' },
        was: 'f',
      },
      { keys: 'C', does: 'Capture', presses: { c: 'capture' }, was: '/' },
      { keys: 'L', does: 'Link this to something', presses: { l: 'link' } },
      { keys: '?', does: 'This list of keys', presses: { '?': 'help' } },
      { keys: '[', does: 'Hide or show the sidebar', presses: { '[': 'sidebar' } },
      ...chords.map((c) => ({
        keys: `${JUMP_PREFIX.toUpperCase()} ${c.key.toUpperCase()}`,
        does: c.label,
        presses: { [JUMP_PREFIX]: 'jump' as const },
        ...(c.was ? { was: c.was } : {}),
      })),
      ...creates.map((c) => ({
        keys: `${NEW_PREFIX.toUpperCase()} ${c.key.toUpperCase()}`,
        does: `New ${c.label.toLocaleLowerCase()}`,
        presses: { [NEW_PREFIX]: 'new' as const },
        ...(c.kind === 'task' ? { was: 'n' } : {}),
      })),
      { keys: 'Esc', does: 'Close the inspector or an overlay', presses: {} },
    ],
  }
}
