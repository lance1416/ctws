import { idFrom, projectId } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { Icon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { ProjectRail } from '../rows/RowParts'
import { type Item, type Linked, useLinked } from './useLinked'

/** The linked things as a block per kind, each with a count and a `+`, beside a page's own block. */
export function LinkBlocks({ of, types }: Linked) {
  const registry = useRegistry()
  const { groups, unlink, setAdding, add, unshown } = useLinked(of, types)
  if (unshown !== undefined) return unshown
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
                <Icon glyph="plusLong" className="size-3.5" strokeWidth={1.7} />
              </button>
            </div>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li
                  key={`${item.id}:${item.kind}:${String(item.outgoing)}`}
                  className="group flex min-w-0 items-stretch"
                >
                  <ProjectRail projectId={thread} />
                  <LinkedBlockRow item={item} />
                  {item.linkId && (
                    <button
                      type="button"
                      disabled={unlink.isPending}
                      onClick={() => unlink.mutate(item.linkId!)}
                      aria-label={`Unlink ${item.title}`}
                      className="flex w-7 shrink-0 items-center justify-center text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                    >
                      <Icon glyph="close" className="h-3 w-3" strokeWidth={1.8} />
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

/** The same, its title over its detail, for a narrow block. */
function LinkedBlockRow({ item }: { item: Item }) {
  const where = useRegistry().relationFor(item.type)
  return (
    <Link
      to={where.to(item.id)}
      data-linked={item.id}
      className="flex min-w-0 flex-1 items-start gap-3 py-2 pr-1 pl-3 hover:bg-hover"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ink">{item.title}</span>
        {item.detail && <span className="truncate text-sm text-ink-subtle">{item.detail}</span>}
      </span>
      {item.label && <span className="shrink-0 text-sm text-ink-muted">{item.label}</span>}
    </Link>
  )
}
