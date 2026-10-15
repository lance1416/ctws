import type { HelpSection } from '../contract'
import { useRegistry, type Registry } from '../registry'
import { setShortcutsEnabled, useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { JUMP_PREFIX } from './chords'
import { Modal } from '../../platform/ui/Modal'

/**
 * The `?` overlay. Nothing in this app announced its own keys before; a keyboard-first tool whose
 * keys are undiscoverable is a keyboard-first tool for the person who wrote it.
 *
 * Grouped by where the key works, because `s` on a task row and `g p` anywhere are not the same
 * kind of thing and a flat list of eleven rows reads as noise.
 */
const groups = (registry: Registry): HelpSection[] => [
  {
    title: 'Anywhere',
    keys: [
      ['/', 'Jump to the capture box'],
      ['f', 'Search, or go to a page'],
      ['?', 'This list of shortcuts'],
      // The jump chords come from the key table, so a module that adds one cannot add it
      // without the help overlay saying so -- an undiscoverable key is no key at all.
      ...registry.chords.map((c) => [`${JUMP_PREFIX} ${c.key}`, c.label] as const),
      ['Esc', 'Close the pane or overlay'],
    ],
  },
  // Then the keys that work only somewhere, in each module's words.
  ...registry.help,
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()
  const registry = useRegistry()

  return (
    // Radix owns Escape, the press outside, the focus trap and the focus restoration; this file
    // only says what is in the layer.
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="px-5 py-4">
        {groups(registry).map((group) => (
          <section key={group.title} className="mt-4 first:mt-0">
            <h3 className="text-sm font-semibold text-ink-muted">{group.title}</h3>
            <dl className="mt-1">
              {group.keys.map(([key, what]) => (
                <div key={`${group.title}-${key}`} className="flex items-baseline gap-3 py-0.5">
                  <dt className="w-[14ch] shrink-0">
                    <kbd className="rounded border border-rule-strong px-1.5 text-xs leading-5 text-ink-muted">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="text-sm text-ink">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {/* The OpenProject 16.2 lesson: single-key shortcuts take keystrokes away from assistive
            technology, so they have to be refusable. Arrow keys, Enter, Escape and the Alt
            combinations are NOT turned off -- those are how a treeview is operated at all, and a
            tree with no arrow keys and one tab stop would be unreachable. */}
        <label className="mt-6 flex items-start gap-2 border-t border-rule pt-4 text-sm text-ink">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setShortcutsEnabled(e.target.checked)}
            className="mt-1 h-4 w-4 accent-ink"
          />
          <span>
            Single-key shortcuts
            <span className="block text-ink-muted">
              With this off, /, f, ?, the g chords, s, x, j and k stop responding. Arrow keys,
              Enter, Esc and the Alt combinations are unaffected. This browser only.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
