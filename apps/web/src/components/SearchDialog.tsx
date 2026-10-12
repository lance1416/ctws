import { KeyHint } from './KeyHint'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { allChords, kinds, pinnedPages, searchProviders } from '../modules/registry'
import { federate, type ProviderResult } from '../modules/search'
import { recentList } from '../recent'
import { useMe } from '../useMe'
import { Modal } from './Modal'
import { useComposing } from '../composition'
import { BUTTON } from './buttonStyles'

/** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
const DEBOUNCE_MS = 150

/** One row of the list, whatever it is: a recent thing, a place, or a module's hit. */
type Row = {
  key: string
  to: string
  title: string
  meta?: ReactNode
  mark?: ReactNode
  rail?: ReactNode
  /** The `g` key that goes straight there, for a place. */
  hint?: string
  /** A module hit's id, its test handle. */
  hit?: string
  group: 'recent' | 'place' | 'hit'
}

const GROUP_LABEL: Partial<Record<Row['group'], string>> = { recent: 'Recent', place: 'Go to' }

/**
 * EVERY PLACE: the pinned pages, Things, and every kind. With no row per kind in the rail this is
 * one of the two ways to a kind's page that skip Things -- the other being its `g` key, which is
 * shown here so it is learned by being seen.
 */
function places(): Row[] {
  const keys = new Map(allChords().map((c) => [c.id, c.key]))
  const all = [
    ...pinnedPages().map((p) => ({ label: p.label, to: p.to, chord: p.chord })),
    { label: 'Things', to: '/things', chord: undefined },
    ...kinds().map((k) => ({ label: k.label, to: k.to, chord: k.chord })),
  ]
  return all.map(({ label, to, chord }) => {
    const key = chord ? keys.get(chord) : undefined
    const place: Row = { key: `place:${label}`, to, title: label, group: 'place' }
    return key ? { ...place, hint: `g ${key}` } : place
  })
}

/**
 * FEDERATED search. Reached with `f` from anywhere, or the Search button in the header.
 *
 * Every module that can be searched contributes a provider and the dialog merges their answers
 * answers. With one module registered the list is exactly the task list it always was, and no row
 * says which module it came from -- there is only one, so a module name would be noise. From two
 * providers on, every row carries its module as TEXT, never as a colour (WCAG 1.4.1, the rule the
 * redesign follows).
 *
 * Where a hit goes is the module's business; the dialog only lays the pieces out, so results from
 * two modules line up in one list instead of each bringing their own row design.
 *
 * WHY THE COMBOBOX IS WRITTEN OUT HERE AND NOT `downshift`'S. The gap this dialog had was a
 * SEMANTICS gap, not a logic gap: no `role="combobox"`, no `aria-expanded`, no
 * `aria-activedescendant`, and results that were buttons instead of options. Those are attributes,
 * and the only state behind them is `at` -- one `Math.min` that keeps the highlight inside a result
 * set that may have shrunk. `useCombobox` would supply the same attributes and that same clamp, and
 * in exchange would take ownership of this input's keydown pipeline: the `Ctrl+N` / `Ctrl+P` pair
 * (not part of any pattern, so it would stay hand-written, only moved into a `stateReducer`), and
 * Escape -- which here must reach the Radix `Dialog` that phase 1 put this layer in and close the
 * whole thing, not merely collapse a menu. Buying twelve attributes and a `Math.min` by handing a
 * library the one seam the dialog's pinned behaviour runs through is not a good trade. It is also
 * the proportion this repo already applies elsewhere, where 27 lines of ranking and six lines of
 * hashing were kept for the same reason.
 *
 * Reverse it if the list grows what a library really does buy: grouped sections, inline
 * autocompletion of the box, or selection that must survive re-sorting. None of those exist here.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const composing = useComposing()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const list = useRef<HTMLUListElement>(null)
  const box = useRef<HTMLInputElement>(null)
  /**
   * The ids the ARIA 1.2 combobox pattern is built out of. `useId` rather than a literal, because
   * two of these dialogs on one page would otherwise point `aria-activedescendant` at each other's
   * options -- and an id that is wrong is worse than one that is missing.
   */
  const base = useId()
  const listId = `${base}-results`
  const optionId = (i: number) => `${base}-option-${i}`

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // One hook per provider, over the frozen module list: see MODULES on why that list must not
  // change at runtime.
  const parts: ProviderResult[] = searchProviders().map((p) => ({
    moduleId: p.moduleId,
    moduleLabel: p.moduleLabel,
    ...p.useHits(debounced),
  }))
  const results = federate(parts)
  // Read once when the dialog opens: the list must not reshuffle under the reader.
  const userId = useMe().data?.id
  const [recent] = useState(() => (userId ? recentList(userId) : []))
  const everywhere = useMemo(places, [])
  // PLACES FOLLOW THE TYPING AT ONCE; only the modules' hits wait for the debounce. Otherwise an
  // Enter pressed before the debounce fires chooses from the list as it was before the typing.
  const typing = query.trim()
  const typed = typing.toLocaleLowerCase()
  // BEFORE TYPING: what was opened lately, then every place. WHILE TYPING: the places whose name
  // matches, then every module's hits.
  const rows: Row[] =
    typing.length === 0
      ? [
          ...recent.map((r) => ({
            key: `recent:${r.type}:${r.id}`,
            to: r.to,
            title: r.title,
            meta: r.kind,
            group: 'recent' as const,
          })),
          ...everywhere,
        ]
      : [
          ...everywhere.filter((p) => p.title.toLocaleLowerCase().includes(typed)),
          ...(debounced.length > 0 ? results.rows : []).map((hit) => ({
            key: `${hit.moduleId}:${hit.id}`,
            to: hit.to,
            title: hit.title,
            // The same breadcrumb the today and completed lists show, prefixed by the module it
            // came from once there is more than one module to tell apart.
            meta: (
              <>
                {results.showModule && `${hit.moduleLabel} · `}
                {hit.meta}
              </>
            ),
            mark: hit.mark,
            rail: hit.rail,
            hit: hit.id,
            group: 'hit' as const,
          })),
        ]
  // A shorter result set must not leave the selection pointing past the end.
  const at = Math.min(active, Math.max(rows.length - 1, 0))

  useEffect(() => setActive(0), [typing, debounced])
  useEffect(() => {
    document.getElementById(optionId(at))?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const choose = (row: Row) => {
    onClose()
    navigate(row.to)
  }

  return (
    /**
     * THE MODAL LAYER IS RADIX'S (`Modal`), never hand-built. `role="dialog" aria-modal="true"`
     * with Escape, press-outside and focus restoration but no Tab handling promises assistive
     * technology that the rest of the page is unreachable while the keyboard walks straight into
     * the task tree underneath -- AT reads focus as being inside the dialog while it is in fact
     * on a row nobody can see. Radix's `FocusScope` is the trap that claim needs.
     *
     * `initialFocus`, not `autoFocus`: Radix moves focus itself when the layer opens, and the
     * first tabbable thing in the panel is the header's Close -- the box is what is being typed
     * into, so it is named explicitly.
     *
     * “Search” and not “Search tasks”: this is a SHELL surface and it merges every module's hits,
     * so naming it after one module would be the shell knowing a module by name. The placeholder
     * names no fields for the same reason: a title and notes are a task's fields, and a book has
     * neither.
     */
    <Modal title="Search" onClose={onClose} initialFocus={box} className="rounded-lg">
      <div className="border-b border-border-subtle px-4 py-3">
        {/**
         * THE ARIA 1.2 COMBOBOX CONTRACT. Without these five attributes the selection the keyboard
         * really has was invisible to a screen reader: the box was a bare `<input aria-label>`, the
         * results a plain `<ul>` of `<button aria-current>`, so ArrowDown moved a highlight that was
         * announced as nothing at all -- no "list, 7 items", no "2 of 7", no title read out. The
         * sighted keyboard user and the screen-reader user were being told different things about the
         * same control, which is the same shape of defect as an `aria-modal` with no focus trap.
         *
         * `aria-activedescendant` and NOT DOM focus: that is the pattern's whole point. Focus stays
         * in the box so typing keeps working while the highlight walks the list -- which is also why
         * the options below are not buttons any more. They were tab stops, so a seven-result search
         * put seven stops between the box and Close.
         */}
        <input
          ref={box}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          role="combobox"
          // The listbox exists whenever there is something in it; `aria-expanded` is the reader's
          // only way to know that, since nothing moves focus when results appear.
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows.length > 0 ? optionId(at) : undefined}
          {...composing.bind}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
              e.preventDefault()
              setActive(Math.min(at + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
              e.preventDefault()
              setActive(Math.max(at - 1, 0))
            } else if (e.key === 'Enter' && !composing.composingNow(e)) {
              e.preventDefault()
              const row = rows[at]
              // A module's hit for words not yet sent would be the previous word's: wait.
              if (row && !(row.group === 'hit' && typing !== debounced)) choose(row)
            }
          }}
          placeholder="Search…"
          aria-label="Search"
          className="h-9 w-full bg-transparent px-0.5 text-fg placeholder:text-fg-muted"
        />
      </div>
      {results.isError && (
        <p role="alert" className="px-4 py-3 text-sm text-danger">
          Search failed. Check that the server is running.
        </p>
      )}
      {debounced.length > 0 && results.isSuccess && rows.length === 0 && (
        <div className="px-4 py-3">
          <p className="text-sm text-fg">Nothing matches</p>
          <button
            type="button"
            // The one action here is to search for something else, so this does the clearing and
            // puts the cursor back in the box rather than making the reader do both.
            onClick={() => {
              setQuery('')
              box.current?.focus()
            }}
            className={`mt-3 -ml-2 ${BUTTON.link}`}
          >
            Try another word
          </button>
        </div>
      )}
      {/* `role="listbox"` on the list and `role="option"` on each row, which is what makes
          `aria-activedescendant` above mean anything: an id pointing at an element with no `option`
          role names nothing a reader can place in a list. The rows are `<li>`s and not buttons on
          purpose -- in this pattern the keyboard reaches them through the box, and a focusable
          option contradicts both `aria-activedescendant` and the one-tab-stop shape of the dialog. */}
      <ul
        ref={list}
        id={listId}
        role="listbox"
        aria-label="Search results"
        className="max-h-[52vh] overflow-y-auto"
      >
        {runs(rows).map((run) => {
          const options = run.rows.map((row, j) => (
            <SearchRow
              key={row.key}
              row={row}
              id={optionId(run.start + j)}
              selected={run.start + j === at}
              onChoose={() => choose(row)}
              onHover={() => setActive(run.start + j)}
            />
          ))
          const label = GROUP_LABEL[run.group]
          if (!label) return options
          // APG's grouped listbox: a named group, so "Recent" and "Go to" are announced, and the
          // keyboard still walks only the options.
          const heading = `${base}-${run.group}`
          return (
            <li key={run.group} role="presentation">
              <div id={heading} className="px-5 pt-3 pb-1 text-xs font-semibold text-fg-subtle">
                {label}
              </div>
              <ul role="group" aria-labelledby={heading}>
                {options}
              </ul>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

/** Consecutive rows of one group, and where the run starts in the flat list. */
function runs(rows: Row[]): { group: Row['group']; start: number; rows: Row[] }[] {
  const out: { group: Row['group']; start: number; rows: Row[] }[] = []
  rows.forEach((row, i) => {
    const last = out[out.length - 1]
    if (last && last.group === row.group) last.rows.push(row)
    else out.push({ group: row.group, start: i, rows: [row] })
  })
  return out
}

function SearchRow({
  row,
  id,
  selected,
  onChoose,
  onHover,
}: {
  row: Row
  id: string
  selected: boolean
  onChoose: () => void
  onHover: () => void
}) {
  return (
    <>
      <li
        id={id}
        role="option"
        data-search-result={row.hit}
        // `aria-selected`, not `aria-current`: in a listbox the selected option is what
        // `aria-selected` says, and it is the attribute `aria-activedescendant` is read with.
        aria-selected={selected}
        onClick={onChoose}
        onMouseEnter={onHover}
        // Same row system as the lists: the module's identity rail at x=0, then the marker
        // and the title at a fixed x. A result's project is a glance, not a read.
        className={`relative flex w-full cursor-pointer items-start gap-2 py-2 pr-4 pl-5 text-left ${
          selected ? 'bg-surface-hover' : ''
        }`}
      >
        {row.rail}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">{row.mark}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-fg">{row.title}</span>
          {row.meta && <span className="truncate text-sm text-fg-muted">{row.meta}</span>}
        </span>
        {row.hint && (
          <KeyHint className="mt-0.5 shrink-0 rounded border border-border-subtle px-1.5 text-xs leading-5 text-fg-subtle">
            {row.hint}
          </KeyHint>
        )}
      </li>
    </>
  )
}
