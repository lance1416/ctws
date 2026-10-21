import { Fragment, useRef, useState } from 'react'
import { keyLabel } from '../../platform/keyboard/keys'
import { singleKeysOf, type KeyTable } from '../../platform/keyboard/keyTable'
import { setShortcutsEnabled, useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { ICON_BUTTON, KEY } from '../../platform/ui/buttonStyles'
import { BarExpandIcon, CloseIcon, PLACE_ICON, type IconComponent } from '../../platform/ui/icons'
import { Modal } from '../../platform/ui/Modal'
import { useRegistry } from '../registry'
import { SEARCH_KEYS } from '../search/SearchDialog'
import { JUMP_PREFIX } from './chords'

/** "a, b and c". */
const listed = (items: readonly string[]): string =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

/** The prefix is said as what it starts. */
const spoken = (key: string) =>
  key === JUMP_PREFIX ? `the ${JUMP_PREFIX.toUpperCase()} jumps` : key

/**
 * The tables in the order the switch names their keys: the page-wide ones, then the modules' from
 * the fewest single keys up, so a short table's keys are not lost at the end of a long one's.
 */
const switchOrder = (anywhere: KeyTable, tables: readonly KeyTable[]): KeyTable[] => [
  anywhere,
  ...tables.toSorted((a, b) => singleKeysOf([a]).length - singleKeysOf([b]).length),
]

type Group = { title: string; icon: IconComponent; rows: KeyTable['rows'] }

/**
 * EVERY KEY IN ONE PLACE (FR-029, artboard 24): opened with `?` or the top bar's keyboard button,
 * grouped by where the keys work, filtered from the top. A key that changed in the redesign says
 * what it was, for the first release after it. The switch that turns single keys off lives here,
 * so it cannot be reachable only by a key.
 */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()
  const registry = useRegistry()
  const [filter, setFilter] = useState('')
  const box = useRef<HTMLInputElement>(null)

  const jumps = registry.anywhere.rows.filter((r) =>
    r.keys.startsWith(`${JUMP_PREFIX.toUpperCase()} `),
  )
  const groups: Group[] = [
    {
      title: 'Anywhere',
      icon: PLACE_ICON.keys,
      rows: registry.anywhere.rows.filter((r) => !jumps.includes(r)),
    },
    { title: 'Go to', icon: BarExpandIcon, rows: jumps },
    ...registry.keys.map((t) => ({ title: t.title, icon: PLACE_ICON.keys, rows: t.rows })),
    { title: SEARCH_KEYS.title, icon: PLACE_ICON.search, rows: SEARCH_KEYS.rows },
  ]
  const needle = filter.trim().toLocaleLowerCase()
  const shown = groups
    .map((g) => ({
      ...g,
      rows: needle
        ? g.rows.filter((r) => `${r.keys} ${r.does}`.toLocaleLowerCase().includes(needle))
        : g.rows,
    }))
    .filter((g) => g.rows.length > 0)

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} initialFocus={box} palette wide>
      <div className="flex h-14 items-center gap-3 border-b border-line pr-3 pl-5">
        <span className="inline-grid size-7 place-items-center rounded-control bg-hover text-muted">
          <PLACE_ICON.keys size={16} aria-hidden="true" />
        </span>
        <h2 className="text-subject text-ink">Keyboard shortcuts</h2>
        <span aria-hidden="true" className="flex-1" />
        <label className="flex h-7.5 w-70 items-center gap-2 rounded-control border border-line-strong bg-panel px-2.5 text-subtle">
          <PLACE_ICON.search size={16} aria-hidden="true" />
          <input
            ref={box}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter keys"
            aria-label="Filter keys"
            className="min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle focus-visible:outline-none"
          />
        </label>
        <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
          <CloseIcon size={16} aria-hidden="true" />
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-6 text-ui text-muted">No key matches “{filter.trim()}”.</p>
      ) : (
        <div className="columns-3 gap-8 px-5 pt-4 pb-5 max-lg:columns-2 max-sm:columns-1">
          {shown.map((g) => (
            <section key={g.title} className="mb-4 break-inside-avoid">
              <h3 className="flex h-8 items-center gap-2 text-ui font-medium text-ink">
                <span className="inline-grid size-5 place-items-center rounded-key bg-hover text-muted">
                  <g.icon size={12} aria-hidden="true" />
                </span>
                {g.title}
              </h3>
              <dl>
                {g.rows.map((row) => (
                  <div
                    key={`${g.title}-${row.keys}`}
                    className="grid min-h-7 grid-cols-[7.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5"
                  >
                    <dt className="flex flex-wrap items-center gap-1">
                      <Caps keys={row.keys} />
                    </dt>
                    <dd className="text-ui text-ink">{row.does}</dd>
                    <dd className="text-meta whitespace-nowrap text-warn-t">
                      {row.was ? `was ${row.was}` : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}

      {/* Single-key shortcuts take keys from assistive technology, so they can be turned off.
          Arrows, Enter, Esc and Alt combinations stay: a treeview cannot work without them. */}
      <label className="flex items-start gap-2 border-t border-line px-5 py-3 text-ui text-ink">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setShortcutsEnabled(e.target.checked)}
          className="mt-1 size-4 accent-ink"
        />
        <span>
          Single-key shortcuts
          <span className="block text-meta text-muted">
            With this off,{' '}
            {listed(singleKeysOf(switchOrder(registry.anywhere, registry.keys)).map(spoken))} stop
            responding. Arrow keys, Enter, Esc and the Alt combinations are unaffected. This browser
            only.
          </span>
        </span>
      </label>
      <div className="flex h-10 items-center gap-2 rounded-b-block border-t border-line bg-chrome px-5 text-meta">
        <span className="text-warn-t">was …</span>
        <span className="text-subtle">This key changed in the redesign.</span>
        <span aria-hidden="true" className="flex-1" />
        <span className="text-subtle">Hover any button to see its key.</span>
      </div>
    </Modal>
  )
}

/** "↓ / Ctrl+N" as caps: alternatives joined by "or", a chord's two keys as two caps. */
function Caps({ keys }: { keys: string }) {
  const alternatives = keys.split(' / ')
  return alternatives.map((alt, i) => (
    <Fragment key={alt}>
      {i > 0 && <span className="text-meta text-subtle">or</span>}
      {alt.split(' ').map((cap, j) => (
        <kbd key={`${cap}-${j}`} className={KEY}>
          {keyLabel(cap)}
        </kbd>
      ))}
    </Fragment>
  ))
}
