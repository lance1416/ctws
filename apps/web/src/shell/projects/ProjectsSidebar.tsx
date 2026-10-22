import { useMutation, useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, useState } from 'react'
import { NavLink, useMatch, useNavigate } from 'react-router-dom'
import { archivedProjectsQuery, createProject, projectKeys, useProjects } from './api'
import { useRegistry } from '../registry'
import { SidebarHead } from '../layout/Sidebar'
import { ProjectSquare } from './ProjectSquare'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CollapseIcon, NewIcon } from '../../platform/ui/icons'
import { useLineEntry } from '../../platform/ui/useLineEntry'

/**
 * The Projects sidebar (FR-020): the inbox, then every live project with how much waits in it,
 * then the archived ones behind their count. Under the open project, its outline (FR-021).
 */
export function ProjectsSidebar() {
  const projects = useProjects()
  const archived = useQuery(archivedProjectsQuery())
  const registry = useRegistry()
  const Outline = registry.projectOutline
  const navigate = useNavigate()
  const open = useMatch('/projects/:id')?.params.id
  const [naming, setNaming] = useState(false)
  const name = useLineEntry()
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (naming) field.current?.focus()
  }, [naming])
  // Made before `useMutation`: inside its options the result's type would not reach `onSuccess`.
  const send = name.sends((text) => createProject({ name: text }))
  const create = useMutation({
    mutationFn: send,
    meta: { changes: ['project'], awaits: [projectKeys.all] },
    onSuccess: (made) => {
      setNaming(false)
      navigate(`/projects/${made.id}`)
    },
  })

  const live = projects.data ?? []
  const inbox = live.find((p) => p.isInbox)
  const others = live.filter((p) => !p.isInbox)
  const row = ({ isActive }: { isActive: boolean }) =>
    `mx-1.5 flex h-7.5 items-center gap-2 rounded-control px-2 text-ui hover:bg-hover ${
      isActive ? 'bg-select font-medium text-ink' : 'text-ink'
    }`

  return (
    <aside
      aria-label="Projects"
      className="flex w-sidebar shrink-0 flex-col border-r border-line bg-chrome"
    >
      <SidebarHead
        label="Projects"
        action={
          <button
            type="button"
            onClick={() => setNaming(true)}
            aria-label="New project"
            title="New project"
            className={ICON_BUTTON}
          >
            <NewIcon size={16} aria-hidden="true" />
          </button>
        }
      >
        {projects.data && others.length}
      </SidebarHead>
      {naming && (
        <input
          ref={field}
          {...name.field({
            onSubmit: create.mutate,
            busy: create.isPending,
            onCancel: () => {
              name.setValue('')
              setNaming(false)
            },
          })}
          onBlur={() => {
            if (!name.value.trim()) setNaming(false)
          }}
          aria-label="New project"
          aria-invalid={create.isError ? true : undefined}
          className={`mx-1.5 mb-1 h-7.5 rounded-control border bg-panel px-2.5 text-ui text-ink ${
            create.isError ? 'border-stop' : 'border-line-strong'
          }`}
        />
      )}
      <nav aria-label="Projects" className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
        {inbox && (
          <NavLink to={`/projects/${inbox.id}`} className={row}>
            <ProjectSquare project={inbox} />
            <span className="flex-1 truncate">{inbox.name}</span>
            <Waiting n={registry.projectCount?.(inbox) ?? 0} />
          </NavLink>
        )}
        {others.map((p) => (
          <Fragment key={p.id}>
            <NavLink to={`/projects/${p.id}`} className={row}>
              <ProjectSquare project={p} />
              <span className="flex-1 truncate">{p.name}</span>
              <Waiting n={registry.projectCount?.(p) ?? 0} />
            </NavLink>
            {Outline && p.id === open && <Outline projectId={p.id} />}
          </Fragment>
        ))}
        {archived.data && archived.data.length > 0 && (
          <NavLink to="/projects" end className={`${row({ isActive: false })} mt-2 text-subtle`}>
            <CollapseIcon size={14} aria-hidden="true" className="mx-0.75" />
            <span className="flex-1">Archived</span>
            <Waiting n={archived.data.length} />
          </NavLink>
        )}
      </nav>
    </aside>
  )
}

/** How much waits in a project; nothing is shown as nothing. */
function Waiting({ n }: { n: number }) {
  if (n === 0) return null
  return (
    <span data-count className="text-meta text-subtle tabular-nums">
      {n}
    </span>
  )
}
