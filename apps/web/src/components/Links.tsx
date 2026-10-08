import type { ObjectType } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { linksKey, listLinks, type Endpoint } from '../api/links'
import { relationFor } from '../modules/registry'
import { PanelEmpty } from './Panel'

/**
 * 牵着的东西 -- everything one thing is connected to, grouped by kind.
 *
 * A SHELL piece. The edges are the shell's: one row of one table says 「这个会有谁参加」 and
 * 「我跟这个人开过哪些会」 at once, and the second one is this panel. Opening a person used to
 * show their own fields and nothing else -- not the meetings they are in, not what they
 * recommended, not the task that came out of a call with them. Those edges existed in the world;
 * there was nowhere in the model to put them.
 *
 * The shell knows the kinds and the phrases, because they are the contract's. What it does not
 * know is where another module's thing LIVES, so it asks the registry (`relations`).
 */
export function Links({ of, className = '' }: { of: Endpoint; className?: string }) {
  const links = useQuery({ queryKey: linksKey(of), queryFn: () => listLinks(of) })
  const groups = links.data ?? []

  if (links.isError) {
    return <PanelEmpty>Couldn't load the links.</PanelEmpty>
  }
  // Nothing at all while loading: a skeleton here would flash on every pane that opens, and the
  // panel is below the thing's own fields rather than in place of them.
  if (groups.length === 0) {
    return links.isLoading ? null : <PanelEmpty>Nothing linked yet.</PanelEmpty>
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
              <li key={`${item.id}:${item.kind}:${String(item.outgoing)}`}>
                <LinkedRow
                  type={item.type}
                  id={item.id}
                  title={item.title}
                  detail={item.detail}
                  label={item.label}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * One thing at the far end of an edge.
 *
 * The EDGE's own word sits at the end of the line rather than grouping the rows: a person's
 * meetings are all 「参加过」, so a heading per phrase would be a heading per row. Where it earns
 * its place is the mixed group -- a project with a task 「属于」 it and another 「关于」 it.
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
  const shape = 'flex min-w-0 items-baseline gap-2 rounded-md px-2 py-1.5 text-sm text-fg'
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
