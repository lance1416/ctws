import type { LinkedObject, ObjectType } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteLink, linksKey, listLinks, type Endpoint } from '../api/links'
import { relationFor } from '../modules/registry'
import { AddLink } from './AddLink'
import { PanelEmpty } from './Panel'
import { BUTTON } from './buttonStyles'
import { ProjectRail } from './RowParts'

/**
 * LINKED -- everything one thing is connected to, grouped by kind.
 *
 * A SHELL piece. The edges are the shell's: one row of one table says who is at a meeting and
 * which meetings a person has been at, and the second reading is this panel -- the meetings
 * somebody is in, what they recommended, the task that came out of a call with them.
 *
 * The shell knows the kinds and the phrases, because they are the contract's. What it does not
 * know is where another module's thing LIVES, so it asks the registry (`relations`).
 */
export function Links({
  of,
  except,
  variant = 'list',
  className = '',
}: {
  of: Endpoint
  /**
   * Kinds this page ALREADY SHOWS, in a module's own block.
   *
   * A project page carries the task tree, and a flat list of the same tasks under it would be the
   * same rows twice -- which is the thing a reader has to hold two of in their head. The edges
   * are still there; this page just does not say them twice.
   */
  except?: readonly ObjectType[] | undefined
  /**
   * `aside`: each kind a block of its own -- its name, how many, a `+` that links one more of that
   * kind, then its rows on a thread -- for a page where Linked sits beside the page's own block.
   */
  variant?: 'list' | 'aside'
  className?: string
}) {
  const qc = useQueryClient()
  // Which kind the picker is for: any kind from "+ Link", one kind from a block's own `+`.
  const [adding, setAdding] = useState<ObjectType | 'any' | null>(null)
  const links = useQuery({ queryKey: linksKey(of), queryFn: () => listLinks(of) })
  const groups = (links.data ?? []).filter((g) => !except?.includes(g.type))
  const unlink = useMutation({
    mutationFn: (row: LinkedObject) =>
      // The stored row runs one way; the panel reads it from whichever end this page is.
      row.outgoing
        ? deleteLink(of, { type: row.type, id: row.id }, row.kind)
        : deleteLink({ type: row.type, id: row.id }, of, row.kind),
    onSettled: () => qc.invalidateQueries({ queryKey: ['links'] }),
  })
  const add = (
    <>
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
  // Nothing at all while loading: a skeleton here would flash on every pane that opens, and the
  // panel is below the thing's own fields rather than in place of them.
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
    // On a project's page every row here met THIS project, so its thread is this project's.
    const thread = of.type === 'project' ? of.id : null
    return (
      <div className={`flex flex-col gap-8 ${className}`}>
        {groups.map((group) => {
          const kind = relationFor(group.type)?.kind.toLowerCase() ?? 'thing'
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
                    {item.removable && (
                      <button
                        type="button"
                        disabled={unlink.isPending}
                        onClick={() => unlink.mutate(item)}
                        aria-label={`Unlink ${item.title}`}
                        className="flex w-7 shrink-0 items-center justify-center text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                      >
                        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
                          <path
                            d="M4 4l8 8M12 4l-8 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
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
    <div className={`flex flex-col gap-4 ${className}`}>
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
                {/* UNLINKING, on the rows that are this panel's to unlink. An edge a module
                    stores in a column of its own is not: a task's project is NOT NULL, so
                    "unlink" there would mean a task belonging to nothing. */}
                {item.removable && (
                  <button
                    type="button"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(item)}
                    aria-label={`Unlink ${item.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                  >
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
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
 * LINKED AS A SECTION OF A DETAIL PANE -- the same markup in all four panes, so it lives once.
 *
 * Every row here carries 8px of padding for its hover plane, and so did the heading to match.
 * In a pane that put the whole block 8px in from every other label above it (`Your time`,
 * `Notes`), so the edge of the text wandered. `-mx-2` gives the padding back to the margin: the
 * words sit on the pane's edge with everything else, and a hover plane bleeds out past it -- what
 * `DangerAction` does with its own padding for the same reason. On a project page the block sits
 * in a `Panel`, whose gutter already accounts for the padding, so it uses `Links` directly.
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

/**
 * One thing at the far end of an edge.
 *
 * The EDGE's own word sits at the end of the line rather than grouping the rows: a person's
 * meetings all read "attended", so a heading per phrase would be a heading per row. Where it
 * earns its place is the mixed group -- a project with a task in it and another about it.
 */
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
  /** Title over its detail, as the rows of a kind's block are: a block is narrow. */
  stacked?: boolean
}) {
  const where = relationFor(type)
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
    const shape = 'flex min-w-0 flex-1 items-start gap-3 py-2 pr-1 pl-3'
    if (!where) return <span className={shape}>{body}</span>
    return (
      <Link to={where.to(id)} data-linked={id} className={`${shape} hover:bg-hover`}>
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
  const shape = 'flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm text-ink'
  // No module answers for this type: a row that cannot be opened, rather than no row at all. The
  // registry test makes this unreachable; it is here because dropping the row silently would hide
  // a real relationship behind a registration mistake.
  if (!where) return <span className={shape}>{body}</span>
  return (
    <Link to={where.to(id)} data-linked={id} className={`${shape} hover:bg-hover`}>
      {body}
    </Link>
  )
}
