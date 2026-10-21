import { idFrom, projectId } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { CloseIcon, NewIcon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { ProjectRail } from '../rows/RowParts'
import { whyOf } from './Links'
import { type Item, type Linked, useLinked } from './useLinked'

/** The related things as a block per kind, each with a count and a `+`, beside a page's own block. */
export function LinkBlocks({ of, types }: Linked) {
  const registry = useRegistry()
  const { groups, unlink, setAdding, add, unshown } = useLinked(of, types)
  if (unshown !== undefined) return unshown
  // On a project's page every row here is related to this project, so it wears its thread.
  const thread = of.type === 'project' ? idFrom(projectId, of.id) : null
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => {
        const where = registry.relationFor(group.type)
        const kind = where.kind.toLowerCase()
        return (
          <section key={group.type} aria-label={where.plural} className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <h3 className="flex items-baseline gap-2 text-prose font-medium text-ink">
                {where.plural}
                <span data-count className="text-ui font-normal text-subtle tabular-nums">
                  {group.items.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setAdding(group.type)}
                aria-label={`Link another ${kind}`}
                className="ml-auto flex size-[30px] items-center justify-center rounded-control text-subtle hover:bg-hover hover:text-ink"
              >
                <NewIcon size={16} className="size-3.5" strokeWidth={1.7} />
              </button>
            </div>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li key={item.relationId} className="group flex min-w-0 items-stretch">
                  <ProjectRail projectId={thread} />
                  <LinkedBlockRow item={item} />
                  {item.origin === 'manual' && (
                    <button
                      type="button"
                      disabled={unlink.isPending}
                      onClick={() => unlink.mutate(item.relationId)}
                      aria-label={`Unlink ${item.title}`}
                      className="flex w-7 shrink-0 items-center justify-center text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                    >
                      <CloseIcon size={16} className="h-3 w-3" strokeWidth={1.8} />
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
  const detail = where.describe?.(item) ?? null
  const why = whyOf(item)
  return (
    <Link
      to={where.to(item.id)}
      data-linked={item.id}
      className="flex min-w-0 flex-1 items-start gap-3 py-2 pr-1 pl-3 hover:bg-hover"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ink">{item.title}</span>
        {detail && <span className="truncate text-ui text-subtle">{detail}</span>}
      </span>
      {why && <span className="shrink-0 truncate text-ui text-muted">{why}</span>}
    </Link>
  )
}
