import type { HelpSection } from '../contract'
import { useRegistry, type Registry } from '../registry'
import { setShortcutsEnabled, useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { JUMP_PREFIX } from './chords'
import { Modal } from '../../platform/ui/Modal'

/** The `?` overlay's keys, grouped by where they work. */
const groups = (registry: Registry): HelpSection[] => [
  {
    title: 'Anywhere',
    keys: [
      ['/', 'Jump to the capture box'],
      ['f', 'Search, or go to a page'],
      ['?', 'This list of shortcuts'],
      // From the key table, so a module cannot add a chord this list does not show.
      ...registry.chords.map((c) => [`${JUMP_PREFIX} ${c.key}`, c.label] as const),
      ['Esc', 'Close the pane or overlay'],
    ],
  },
  ...registry.help,
]

/** "a, b and c". */
const listed = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()
  const registry = useRegistry()

  return (
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
        {/* Single-key shortcuts take keys from assistive technology, so they can be turned off.
            Arrows, Enter, Esc and Alt combinations stay: a treeview cannot work without them. */}
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
              With this off,{' '}
              {listed(['/', 'f', '?', `the ${JUMP_PREFIX} chords`, ...registry.bareKeys])} stop
              responding. Arrow keys, Enter, Esc and the Alt combinations are unaffected. This
              browser only.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
