import { singleKeysOf, type KeyTable } from '../../platform/keyboard/keyTable'
import { useRegistry } from '../registry'
import { setShortcutsEnabled, useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { JUMP_PREFIX } from './chords'
import { Modal } from '../../platform/ui/Modal'

/** "a, b and c". */
const listed = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** The prefix is said as what it starts. */
const spoken = (key: string) => (key === JUMP_PREFIX ? `the ${JUMP_PREFIX} chords` : key)

/**
 * The tables in the order the switch names their keys: the page-wide ones, then the modules' from
 * the fewest single keys up, so a short table's keys are not lost at the end of a long one's.
 */
const switchOrder = (anywhere: KeyTable, tables: readonly KeyTable[]): KeyTable[] => [
  anywhere,
  ...tables.toSorted((a, b) => singleKeysOf([a]).length - singleKeysOf([b]).length),
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()
  const registry = useRegistry()
  const tables = [registry.anywhere, ...registry.keys]

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="px-5 py-4">
        {tables.map((table) => (
          <section key={table.title} className="mt-4 first:mt-0">
            <h3 className="text-sm font-semibold text-ink-muted">{table.title}</h3>
            <dl className="mt-1">
              {table.rows.map(({ keys, does }) => (
                <div key={`${table.title}-${keys}`} className="flex items-baseline gap-3 py-0.5">
                  <dt className="w-[14ch] shrink-0">
                    <kbd className="rounded border border-rule-strong px-1.5 text-xs leading-5 text-ink-muted">
                      {keys}
                    </kbd>
                  </dt>
                  <dd className="text-sm text-ink">{does}</dd>
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
              {listed(singleKeysOf(switchOrder(registry.anywhere, registry.keys)).map(spoken))} stop
              responding. Arrow keys, Enter, Esc and the Alt combinations are unaffected. This
              browser only.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
