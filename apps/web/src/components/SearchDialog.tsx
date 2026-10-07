import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProviders } from '../modules/registry'
import { federate, type FederatedHit, type ProviderResult } from '../modules/search'
import { Modal } from './Modal'

/** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
const DEBOUNCE_MS = 150

/**
 * FEDERATED search (D46). Reached with `f` from anywhere, or the 搜索 button in the header.
 *
 * Every module that can be searched contributes a provider and the dialog merges their answers
 * (module-boundary contract §3). With one module registered the list is exactly the task list it
 * always was, and no row says which module it came from -- there is only one, so a module name
 * would be noise. From two providers on, every row carries its module as TEXT, never as a colour
 * (WCAG 1.4.1, the rule the redesign follows).
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
  const rows = debounced.length > 0 ? results.rows : []
  // A shorter result set must not leave the selection pointing past the end.
  const at = Math.min(active, Math.max(rows.length - 1, 0))

  useEffect(() => setActive(0), [debounced])
  useEffect(() => {
    list.current?.children[at]?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const choose = (hit: FederatedHit) => {
    onClose()
    navigate(hit.to)
  }

  return (
    /**
     * THE MODAL LAYER IS RADIX'S (`Modal`), not the hand-built `Overlay` this dialog used to sit
     * in. That overlay declared `role="dialog" aria-modal="true"` and handled Escape, the press
     * outside and the focus restoration -- but it had no Tab handling at all, so it promised
     * assistive technology that the rest of the page was unreachable while the keyboard could
     * still walk straight into the task tree underneath. A broken promise is worse than no
     * promise: AT reads focus as being inside the dialog while it is in fact on a row nobody can
     * see. Radix's `FocusScope` is the trap that claim needed.
     *
     * `initialFocus`, not `autoFocus`: Radix moves focus itself when the layer opens, and the
     * first tabbable thing in the panel is the header's 关闭 -- the box is what is being typed
     * into, so it is named explicitly.
     */
    <Modal title="搜索任务" onClose={onClose} initialFocus={box} className="rounded-lg">
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
         * put seven stops between the box and 关闭.
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
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
              e.preventDefault()
              setActive(Math.min(at + 1, rows.length - 1))
            } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
              e.preventDefault()
              setActive(Math.max(at - 1, 0))
            } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              const hit = rows[at]
              if (hit) choose(hit)
            }
          }}
          placeholder="搜索标题和备注…"
          aria-label="搜索任务"
          className="h-9 w-full bg-transparent px-0.5 text-fg placeholder:text-fg-muted"
        />
      </div>
      {results.isError && (
        <p role="alert" className="px-4 py-3 text-sm text-danger">
          搜索失败，检查服务是否在运行
        </p>
      )}
      {debounced.length > 0 && results.isSuccess && rows.length === 0 && (
        <div className="px-4 py-3">
          <p className="text-sm text-fg">没有匹配的任务</p>
          <p className="mt-1 text-sm text-fg-muted">
            搜索覆盖所有项目的标题和备注，包括已归档的项目。
          </p>
          <button
            type="button"
            // The one action here is to search for something else, so this does the clearing and
            // puts the cursor back in the box rather than making the reader do both.
            onClick={() => {
              setQuery('')
              box.current?.focus()
            }}
            className="mt-3 -ml-2 rounded-md px-2 py-1 text-sm text-accent"
          >
            换个词
          </button>
        </div>
      )}
      {debounced.length === 0 && (
        <p className="px-4 py-3 text-sm text-fg-muted">输入关键词搜索所有项目的任务</p>
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
        aria-label="搜索结果"
        className="max-h-[52vh] overflow-y-auto"
      >
        {rows.map((hit, i) => (
          <li
            key={`${hit.moduleId}:${hit.id}`}
            id={optionId(i)}
            role="option"
            data-search-result={hit.id}
            // `aria-selected`, not `aria-current`: in a listbox the selected option is what
            // `aria-selected` says, and it is the attribute `aria-activedescendant` is read with.
            aria-selected={i === at}
            onClick={() => choose(hit)}
            onMouseEnter={() => setActive(i)}
            // Same row system as the lists: the module's identity rail at x=0, then the marker
            // and the title at a fixed x. A result's project is a glance, not a read.
            className={`relative flex w-full cursor-pointer items-start gap-2 py-2 pr-4 pl-5 text-left ${
              i === at ? 'bg-surface-hover' : ''
            }`}
          >
            {hit.rail}
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">{hit.mark}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-fg">{hit.title}</span>
              {/* The same breadcrumb the today and completed lists show, so a result is
                  actionable without opening it -- prefixed by the module it came from once
                  there is more than one module to tell apart. */}
              <span className="truncate text-sm text-fg-muted">
                {results.showModule && `${hit.moduleLabel} · `}
                {hit.meta}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
