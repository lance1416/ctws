import type { LinkedObject, ObjectType } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteLink, linksKey, listLinks, type Endpoint } from '../api/links'
import { relationFor } from '../modules/registry'
import { AddLink } from './AddLink'
import { PanelEmpty } from './Panel'
import { BUTTON } from './buttonStyles'

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
  except?: readonly ObjectType[]
  className?: string
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
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
      <button type="button" onClick={() => setAdding(true)} className={`self-start ${BUTTON.link}`}>
        + Link
      </button>
      {adding && <AddLink of={of} onClose={() => setAdding(false)} />}
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

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {groups.map((group) => (
        <section key={group.type} aria-label={group.label} className="flex flex-col gap-1">
          <h3 className="flex items-baseline gap-2 px-2 text-xs font-semibold text-fg-subtle">
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
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover hover:text-fg disabled:opacity-50 [@media(hover:none)]:opacity-100"
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
}: {
  type: ObjectType
  id: string
  title: string
  detail: string | null
  label: string
}) {
  const where = relationFor(type)
  const body = (
    <>
      <span className="min-w-0 flex-[2] truncate">{title}</span>
      {detail && <span className="min-w-0 shrink truncate text-xs text-fg-muted">{detail}</span>}
      {label && <span className="shrink-0 text-xs text-fg-subtle">{label}</span>}
    </>
  )
  const shape = 'flex min-w-0 flex-1 items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm text-fg'
  // No module answers for this type: a row that cannot be opened, rather than no row at all. The
  // registry test makes this unreachable; it is here because dropping the row silently would hide
  // a real relationship behind a registration mistake.
  if (!where) return <span className={shape}>{body}</span>
  return (
    <Link to={where.to(id)} data-linked={id} className={`${shape} hover:bg-surface-hover`}>
      {body}
    </Link>
  )
}
