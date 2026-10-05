import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchProviders } from '../modules/registry'
import { federate, type FederatedHit, type ProviderResult } from '../modules/search'
import { Overlay } from './Overlay'

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
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const list = useRef<HTMLUListElement>(null)
  const box = useRef<HTMLInputElement>(null)

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
    <Overlay label="搜索任务" onClose={onClose} className="rounded-lg">
      <div className="border-b border-border-subtle px-4 py-3">
        <input
          ref={box}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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
      <ul ref={list} className="max-h-[52vh] overflow-y-auto">
        {rows.map((hit, i) => (
          <li key={`${hit.moduleId}:${hit.id}`}>
            <button
              type="button"
              data-search-result={hit.id}
              aria-current={i === at ? 'true' : undefined}
              onClick={() => choose(hit)}
              onMouseEnter={() => setActive(i)}
              // Same row system as the lists: the module's identity rail at x=0, then the marker
              // and the title at a fixed x. A result's project is a glance, not a read.
              className={`relative flex w-full items-start gap-2 py-2 pr-4 pl-5 text-left leading-snug ${
                i === at ? 'bg-surface-sunken' : ''
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
            </button>
          </li>
        ))}
      </ul>
    </Overlay>
  )
}
