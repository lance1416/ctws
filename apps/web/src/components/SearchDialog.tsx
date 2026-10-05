import type { SearchTaskResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchTasks } from '../api/search'
import { ProjectRail } from './RowParts'
import { StatusMark } from './StatusMark'
import { Overlay } from './Overlay'

/** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
const DEBOUNCE_MS = 150

/**
 * Cross-project search (D46). Reached with `f` from anywhere, or the 搜索 button in the header.
 *
 * Choosing a result goes to the task's project with `?reveal=<id>`, which `TaskTree` consumes by
 * unfolding the ancestors and putting focus on that row. Routing alone is not enough: the row may
 * sit in a collapsed subtree, and arriving at a folded parent is exactly the failure this is for.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const results = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => searchTasks(debounced),
    enabled: debounced.length > 0,
  })
  const rows = debounced.length > 0 ? (results.data ?? []) : []
  // A shorter result set must not leave the selection pointing past the end.
  const at = Math.min(active, Math.max(rows.length - 1, 0))

  useEffect(() => setActive(0), [debounced])
  useEffect(() => {
    list.current?.children[at]?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const choose = (task: SearchTaskResponse) => {
    onClose()
    navigate(`/projects/${task.projectId}?reveal=${task.id}`)
  }

  return (
    <Overlay label="搜索任务" onClose={onClose} className="rounded-lg">
      <div className="border-b border-border-subtle px-4 py-3">
        <input
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
              const task = rows[at]
              if (task) choose(task)
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
        <p className="px-4 py-3 text-sm text-fg-muted">没有匹配的任务</p>
      )}
      {debounced.length === 0 && (
        <p className="px-4 py-3 text-sm text-fg-muted">输入关键词搜索所有项目的任务</p>
      )}
      <ul ref={list} className="max-h-[52vh] overflow-y-auto">
        {rows.map((t, i) => (
          <li key={t.id}>
            <button
              type="button"
              data-search-result={t.id}
              aria-current={i === at ? 'true' : undefined}
              onClick={() => choose(t)}
              onMouseEnter={() => setActive(i)}
              // Same row system as the lists: the project rail at x=0, then the marker and
              // the title at a fixed x. A result's project is a glance, not a read.
              className={`relative flex w-full items-start gap-2 py-2 pr-4 pl-5 text-left leading-snug ${
                i === at ? 'bg-surface-sunken' : ''
              }`}
            >
              <ProjectRail projectId={t.projectId} />
              <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                <StatusMark status={t.status} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-fg">{t.title}</span>
                {/* The same breadcrumb the today and completed lists show, so a result is
                    actionable without opening it. */}
                <span className="truncate text-sm text-fg-muted">
                  {t.parentTitle === null ? t.projectName : `${t.projectName} › ${t.parentTitle}`}
                  {t.projectArchived && ' · 已归档'}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Overlay>
  )
}
