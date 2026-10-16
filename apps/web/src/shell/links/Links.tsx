import { idFrom, type LinkId, type ObjectType, projectId } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteLink, linksQuery, type Endpoint } from './api'
import { problemText } from '../../platform/http/api'
import { useRegistry } from '../registry'
import { AddLink } from './AddLink'
import { PanelEmpty } from '../../platform/ui/Panel'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { ProjectRail } from '../rows/RowParts'
import { CloseIcon } from '../../platform/ui/icons'

/**
 * Everything one thing is linked to, grouped by kind. The edges are the shell's; where another
 * module's thing lives comes from the registry's `relations`.
 */
export function Links({
  of,
  except,
  variant = 'list',
}: {
  of: Endpoint
  /** Kinds the page already shows in a module's own block, so they are not listed twice. */
  except?: readonly ObjectType[] | undefined
  /** `aside`: each kind its own block with a count and a `+`, beside a page's own block. */
  variant?: 'list' | 'aside'
}) {
  const registry = useRegistry()
  // Which kind the picker is for: any kind from "+ Link", one kind from a block's own `+`.
  const [adding, setAdding] = useState<ObjectType | 'any' | null>(null)
  const links = useQuery(linksQuery(of))
  const groups = (links.data ?? []).filter((g) => !except?.includes(g.type))
  const unlink = useMutation({
    mutationFn: (id: LinkId) => deleteLink(id),
    meta: { awaits: [['links']] },
  })
  const add = (
    <>
      {unlink.isError && (
        <p role="alert" className="px-2 text-sm text-danger">
          {problemText(unlink.error)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setAdding('any')}
        className={`self-start ${BUTTON.link}`}
      >
        + Link
      </button>
      {adding && (
        <AddLink
          of={of}
          only={adding === 'any' ? undefined : adding}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  )

  if (links.isError) {
    return <PanelEmpty>Couldn't load the links.</PanelEmpty>
  }
  // Nothing at all while loading: a skeleton would flash on every pane that opens.
  if (groups.length === 0) {
    if (links.isLoading) return null
    return (
      <div className="flex flex-col gap-1">
        <PanelEmpty>Nothing linked yet.</PanelEmpty>
        {add}
      </div>
    )
  }

  if (variant === 'aside') {
    // On a project's page every row here is linked to this project, so it wears its thread.
    const thread = of.type === 'project' ? idFrom(projectId, of.id) : null
    return (
      <div className="flex flex-col gap-8">
        {groups.map((group) => {
          const kind = registry.relationFor(group.type).kind.toLowerCase()
          return (
            <section key={group.type} aria-label={group.label} className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="flex items-baseline gap-2 text-base font-semibold text-ink">
                  {group.label}
                  <span data-count className="text-sm font-normal text-ink-subtle tabular-nums">
                    {group.items.length}
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={() => setAdding(group.type)}
                  aria-label={`Link another ${kind}`}
                  className="ml-auto flex size-[30px] items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="size-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                </button>
              </div>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <li
                    key={`${item.id}:${item.kind}:${String(item.outgoing)}`}
                    className="group flex min-w-0 items-stretch"
                  >
                    <ProjectRail projectId={thread} />
                    <LinkedRow
                      type={item.type}
                      id={item.id}
                      title={item.title}
                      detail={item.detail}
                      label={item.label}
                      stacked
                    />
                    {item.linkId && (
                      <button
                        type="button"
                        disabled={unlink.isPending}
                        onClick={() => unlink.mutate(item.linkId!)}
                        aria-label={`Unlink ${item.title}`}
                        className="flex w-7 shrink-0 items-center justify-center text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                      >
                        <CloseIcon className="h-3 w-3" strokeWidth={1.8} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {add}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.type} aria-label={group.label} className="flex flex-col gap-1">
          <h3 className="flex items-baseline gap-2 px-2 text-xs font-semibold text-ink-subtle">
            {group.label}
            <span className="tabular-nums font-normal">{group.items.length}</span>
          </h3>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <li
                key={`${item.id}:${item.kind}:${String(item.outgoing)}`}
                className="group flex min-w-0 items-center"
              >
                <LinkedRow
                  type={item.type}
                  id={item.id}
                  title={item.title}
                  detail={item.detail}
                  label={item.label}
                />
                {/* Only edges in the shell's table unlink; a task's project is required. */}
                {item.linkId && (
                  <button
                    type="button"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(item.linkId!)}
                    aria-label={`Unlink ${item.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                  >
                    <CloseIcon className="h-3 w-3" strokeWidth={1.8} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {add}
    </div>
  )
}

/**
 * Linked as a section of a detail pane. `-mx-2` gives the rows' hover padding back to the margin,
 * so their words line up with the pane's other labels.
 */
export function LinkedSection({
  of,
  except,
  className = '',
}: {
  of: Endpoint
  except?: readonly ObjectType[] | undefined
  className?: string
}) {
  return (
    <section aria-label="Linked" className={`border-t border-rule pt-3 ${className}`}>
      <div className="-mx-2">
        <span className="block px-2 pb-1 text-xs text-ink-muted">Linked</span>
        <Links of={of} except={except} />
      </div>
    </section>
  )
}

/** One thing at the far end of an edge, with the edge's own word at the end of the line. */
function LinkedRow({
  type,
  id,
  title,
  detail,
  label,
  stacked = false,
}: {
  type: ObjectType
  id: string
  title: string
  detail: string | null
  label: string
  /** Title over its detail, for a narrow block. */
  stacked?: boolean
}) {
  const where = useRegistry().relationFor(type)
  if (stacked) {
    const body = (
      <>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ink">{title}</span>
          {detail && <span className="truncate text-sm text-ink-subtle">{detail}</span>}
        </span>
        {label && <span className="shrink-0 text-sm text-ink-muted">{label}</span>}
      </>
    )
    return (
      <Link
        to={where.to(id)}
        data-linked={id}
        className="flex min-w-0 flex-1 items-start gap-3 py-2 pr-1 pl-3 hover:bg-hover"
      >
        {body}
      </Link>
    )
  }
  const body = (
    <>
      <span className="min-w-0 flex-[2] truncate">{title}</span>
      {detail && <span className="min-w-0 shrink truncate text-xs text-ink-muted">{detail}</span>}
      {label && <span className="shrink-0 text-xs text-ink-subtle">{label}</span>}
    </>
  )
  return (
    <Link
      to={where.to(id)}
      data-linked={id}
      className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-hover"
    >
      {body}
    </Link>
  )
}
