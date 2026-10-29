import { Fragment, useRef, useState } from 'react'
import { keyLabel } from '../../platform/keyboard/keys'
import { singleKeysOf, type KeyTable } from '../../platform/keyboard/keyTable'
import { useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { ICON_BUTTON, KEY } from '../../platform/ui/buttonStyles'
import {
  BarExpandIcon,
  BoardIcon,
  CloseIcon,
  EditIcon,
  KIND_ICON,
  NewIcon,
  PLACE_ICON,
  type IconComponent,
} from '../../platform/ui/icons'
import { Modal } from '../../platform/ui/Modal'
import { PROJECT_KEYS, WORKBENCH_KEYS } from '../projects/keys'
import { useSetSingleKeys } from '../auth'
import { useRegistry } from '../registry'
import { SEARCH_KEYS } from '../search/SearchDialog'
import { JUMP_PREFIX, NEW_PREFIX } from './chords'

/**
 * The tables in the order the switch names their keys: the page-wide ones, then the modules' from
 * the fewest single keys up, so a short table's keys are not lost at the end of a long one's.
 */
const switchOrder = (anywhere: KeyTable, tables: readonly KeyTable[]): KeyTable[] => [
  anywhere,
  ...tables.toSorted((a, b) => singleKeysOf([a]).length - singleKeysOf([b]).length),
]

type Group = { title: string; icon: IconComponent; tint: string; rows: KeyTable['rows'] }

/**
 * Where each group stands (artboard 24): three columns, a group in its column in this order. A
 * module's table goes where its title says; one with a title not here goes last in the third.
 */
const COLUMNS: readonly (readonly string[])[] = [
  ['Anywhere', 'Go to'],
  ['New', 'On a project', 'On a board, with a card focused', 'On the Workbench'],
  ['In a tree or list, with a row focused', 'In search', 'In a form'],
]

/**
 * EVERY KEY IN ONE PLACE (FR-029, artboard 24): opened with `?` or the top bar's keyboard button,
 * grouped by where the keys work, filtered from the top. A key that changed in the redesign says
 * what it was, for the first release after it. The switch that turns single keys off lives here,
 * so it cannot be reachable only by a key.
 */
export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const enabled = useShortcutsEnabled()
  const setSingleKeys = useSetSingleKeys()
  const registry = useRegistry()
  const [filter, setFilter] = useState('')
  const box = useRef<HTMLInputElement>(null)

  const jumps = registry.anywhere.rows.filter((r) =>
    r.keys.startsWith(`${JUMP_PREFIX.toUpperCase()} `),
  )
  const makes = registry.anywhere.rows.filter((r) =>
    r.keys.startsWith(`${NEW_PREFIX.toUpperCase()} `),
  )
  const grey = 'bg-hover text-muted'
  const all: Group[] = [
    {
      title: 'Anywhere',
      icon: PLACE_ICON.keys,
      tint: grey,
      rows: registry.anywhere.rows.filter((r) => !jumps.includes(r) && !makes.includes(r)),
    },
    { title: 'Go to', icon: BarExpandIcon, tint: grey, rows: jumps },
    { title: 'New', icon: NewIcon, tint: grey, rows: makes },
    {
      title: PROJECT_KEYS.title,
      icon: KIND_ICON.project,
      tint: 'bg-project-bg text-project',
      rows: PROJECT_KEYS.rows,
    },
    {
      title: WORKBENCH_KEYS.title,
      icon: PLACE_ICON.workbench,
      tint: grey,
      rows: WORKBENCH_KEYS.rows,
    },
    ...registry.keys.map((t) => ({
      title: t.title,
      icon: KIND_ICON.task,
      tint: 'bg-task-bg text-task',
      rows: t.rows,
    })),
    { title: SEARCH_KEYS.title, icon: PLACE_ICON.search, tint: grey, rows: SEARCH_KEYS.rows },
    // Said here, kept by the board and every form themselves: no single key among them (U-22).
    {
      title: 'On a board, with a card focused',
      icon: BoardIcon,
      tint: 'bg-task-bg text-task',
      rows: [
        { keys: '↑ ↓ ← →', does: 'Move between cards', presses: {} },
        { keys: 'Alt+← Alt+→', does: 'Move the card to the column beside', presses: {} },
        { keys: 'Enter', does: 'Open the card', presses: {} },
      ],
    },
    {
      title: 'In a form',
      icon: EditIcon,
      tint: grey,
      rows: [
        { keys: 'Ctrl+Enter', does: 'Save', presses: {} },
        { keys: 'Esc', does: 'Cancel, asking first when something was changed', presses: {} },
      ],
    },
  ]
  // Tables under one title are one group: Today's row keys are the tree's, said once.
  const merged = new Map<string, Group>()
  for (const g of all) {
    const had = merged.get(g.title)
    if (!had) merged.set(g.title, g)
    else
      merged.set(g.title, {
        ...had,
        rows: [...had.rows, ...g.rows.filter((r) => !had.rows.some((h) => h.keys === r.keys))],
      })
  }
  const needle = filter.trim().toLocaleLowerCase()
  const shown = [...merged.values()]
    .map((g) => ({
      ...g,
      rows: needle
        ? g.rows.filter((r) => `${r.keys} ${r.does}`.toLocaleLowerCase().includes(needle))
        : g.rows,
    }))
    .filter((g) => g.rows.length > 0)
  const placed = COLUMNS.map((titles, i) => [
    ...titles.flatMap((t) => shown.filter((g) => g.title === t)),
    ...(i === COLUMNS.length - 1 ? shown.filter((g) => !COLUMNS.flat().includes(g.title)) : []),
  ])
  const singles = singleKeysOf(
    switchOrder(registry.anywhere, [PROJECT_KEYS, WORKBENCH_KEYS, ...registry.keys]),
  )

  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} initialFocus={box} palette wide>
      <div className="flex h-14 items-center gap-3 border-b border-line pr-3 pl-5">
        <span className="inline-grid size-7 place-items-center rounded-control bg-hover text-muted">
          <PLACE_ICON.keys size={16} aria-hidden="true" />
        </span>
        <h2 className="text-subject text-ink">Keyboard shortcuts</h2>
        <span aria-hidden="true" className="flex-1" />
        <label
          data-field
          className="flex h-7.5 w-70 items-center gap-2 rounded-control border border-line-strong bg-panel px-2.5 text-subtle"
        >
          <PLACE_ICON.search size={16} aria-hidden="true" />
          <input
            ref={box}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter keys"
            aria-label="Filter keys"
            className="min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle"
          />
        </label>
        <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
          <CloseIcon size={16} aria-hidden="true" />
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-6 text-ui text-muted">No keys match “{filter.trim()}”.</p>
      ) : (
        <div className="grid grid-cols-3 gap-x-8 px-5 pt-4 pb-1 max-lg:grid-cols-2 max-sm:grid-cols-1">
          {placed.map((column, i) => (
            <div key={i} className="flex min-w-0 flex-col">
              {column.map((g) => (
                <section key={g.title} className="mb-4">
                  <h3 className="flex h-8 items-center gap-2 text-ui font-medium text-ink">
                    <span
                      className={`inline-grid size-5 place-items-center rounded-control ${g.tint}`}
                    >
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
          ))}
        </div>
      )}

      {/* Single-key shortcuts take keys from assistive technology, so they can be turned off
          (WCAG 2.1.4). Last in the list: one line, the keys as caps, and the switch. Arrows,
          Enter, Esc and Alt combinations stay: a treeview cannot work without them. */}
      <label className="mx-5 mb-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-ui text-ink">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={(e) => setSingleKeys(e.target.checked)}
          className="size-4 accent-ink"
        />
        Single-key shortcuts
        <span className="inline-flex flex-wrap items-center gap-1">
          {spans(singles).map((k) => (
            <kbd key={k} className={KEY}>
              {k.toUpperCase()}
            </kbd>
          ))}
        </span>
        <span className="text-meta text-subtle">
          Arrows, Enter, Esc and {keyLabel('keys with Ctrl or Alt')} always work. Kept with your
          account.
        </span>
      </label>
      <div className="flex h-10 items-center gap-2 rounded-b-block border-t border-line bg-chrome px-5 text-meta">
        <span className="text-warn-t">was …</span>
        <span className="text-subtle">This key changes in the redesign.</span>
        <span aria-hidden="true" className="flex-1" />
        <span className="text-subtle">Hover any button to see its key.</span>
      </div>
    </Modal>
  )
}

/** "↓ or Ctrl+N" as caps: alternatives joined by "or", a chord's two keys as two caps. */
function Caps({ keys }: { keys: string }) {
  const alternatives = keys.split(' or ')
  return alternatives.map((alt, i) => (
    <Fragment key={alt}>
      {i > 0 && <span className="text-meta text-subtle">or</span>}
      {alt.split(' ').map((cap, j) => (
        <kbd key={`${cap}-${j}`} className={KEY}>
          {cap.length === 1 ? cap.toUpperCase() : keyLabel(cap)}
        </kbd>
      ))}
    </Fragment>
  ))
}

/** The single keys as caps, a run of digits as one: "1–7", not a cap each (artboard 24). */
function spans(keys: readonly string[]): string[] {
  const digits = keys.filter((k) => /^[0-9]$/.test(k)).sort()
  const rest = keys.filter((k) => !/^[0-9]$/.test(k))
  if (digits.length < 3) return [...rest, ...digits]
  return [...rest, `${digits[0]}–${digits.at(-1)}`]
}
