import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { createProject, useProjects } from '../projects/api'
import { useRegistry } from '../registry'
import { railClass } from '../projects/projectColor'
import { useInlineEdit } from '../../platform/ui/useInlineEdit'
import { PlusIcon } from '../../platform/ui/icons'

/**
 * The left column: the pinned pages, Things, and the projects, with how much is waiting in each.
 * Not a `<ul>`: the pages render their own lists, and listitems here would muddle their counts.
 */
export function SideRail() {
  const projects = useProjects()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const registry = useRegistry()
  const pinned = registry.pinned
  const within = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  const inThings =
    within('/things') ||
    registry.kinds.some(
      (k) => k.moduleId !== null && !pinned.some((p) => p.to === k.to) && within(k.to),
    )
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (naming) field.current?.focus()
  }, [naming])

  const create = useMutation({
    mutationFn: createProject,
    meta: { awaits: [['projects']] },
    onSuccess: (made) => {
      setName('')
      setNaming(false)
      navigate(`/projects/${made.id}`)
    },
  })
  const submit = () => {
    const t = name.trim()
    if (t && !create.isPending) create.mutate({ name: t })
  }
  const nameKeys = useInlineEdit({
    onCommit: submit,
    onCancel: () => {
      setName('')
      setNaming(false)
    },
  })

  return (
    // Hidden below 1024px, where BottomBar navigates. Sticky under the header, so a long page
    // scrolls past it rather than leaving blank space beside the sheet.
    <div className="sticky top-[calc(3.25rem+1px)] hidden h-[calc(100vh-3.25rem-1px)] flex-col overflow-y-auto border-r border-rule bg-chrome py-4 pr-3 pl-4 lg:flex">
      <nav aria-label="Main navigation" className="flex flex-col">
        {pinned.map(({ key, to, label, end, Count }) => (
          <NavLink
            key={key}
            to={to}
            end={end ?? false}
            className={({ isActive }) =>
              `flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2.5 py-1 whitespace-nowrap ${
                isActive ? 'bg-select font-semibold text-ink' : 'text-ink-muted hover:text-ink'
              }`
            }
          >
            <span>{label}</span>
            {Count && <Count />}
          </NavLink>
        ))}
        <span aria-hidden="true" className="h-3 shrink-0" />
        {/* Current on every unpinned kind's page too, since a kind has no row of its own. */}
        <Link
          to="/things"
          aria-current={inThings ? 'page' : undefined}
          className={`flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2.5 py-1 whitespace-nowrap ${
            inThings ? 'bg-select font-semibold text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Things
        </Link>

        <div className="mt-6 flex shrink-0 items-center gap-1">
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`
            }
          >
            Projects
          </NavLink>
          <button
            type="button"
            onClick={() => setNaming(true)}
            aria-label="New project"
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink"
          >
            <PlusIcon className="h-3.5 w-3.5" strokeWidth={1.6} />
          </button>
        </div>
        {naming && (
          <input
            ref={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            {...nameKeys}
            onBlur={() => {
              if (!name.trim()) setNaming(false)
            }}
            aria-label="New project"
            aria-invalid={create.isError ? true : undefined}
            className={`mx-2.5 block h-8 rounded-md border bg-sheet px-2 text-sm text-ink ${
              create.isError ? 'border-danger' : 'border-rule-strong'
            }`}
          />
        )}

        <div className="flex flex-col">
          {projects.data?.map((p) => (
            <NavLink
              key={p.id}
              to={`/projects/${p.id}`}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-2.5 rounded-md py-1 pr-2 pl-2.5 ${
                  isActive ? 'bg-select text-ink' : 'text-ink-muted hover:text-ink'
                }`
              }
            >
              <span
                aria-hidden="true"
                className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(p.color)}`}
              />
              <span className="truncate">{p.name}</span>
              {p.openTasks > 0 && (
                <span data-count className="ml-auto pl-1 text-sm text-ink-subtle tabular-nums">
                  {p.openTasks}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
