import { Link } from 'react-router-dom'
import { CloseIcon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { type Item, type Linked, useLinked } from './useLinked'

/** The related things as one list, a small heading per kind: a detail pane's. */
export function LinkList({ of, types }: Linked) {
  const registry = useRegistry()
  const { groups, unlink, add, unshown } = useLinked(of, types)
  if (unshown !== undefined) return unshown
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section
          key={group.type}
          aria-label={registry.relationFor(group.type).plural}
          className="flex flex-col gap-1"
        >
          <h3 className="flex items-baseline gap-2 px-2 text-meta font-medium text-subtle">
            {registry.relationFor(group.type).plural}
            <span className="tabular-nums font-normal">{group.items.length}</span>
          </h3>
          <ul className="flex flex-col">
            {group.items.map((item) => (
              <li key={item.relationId} className="group flex min-w-0 items-center">
                <LinkedLine item={item} />
                {/* A mention goes with its sentence; only a relation made by hand unlinks here. */}
                {item.origin === 'manual' && (
                  <button
                    type="button"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(item.relationId)}
                    aria-label={`Unlink ${item.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                  >
                    <CloseIcon size={16} className="h-3 w-3" strokeWidth={1.8} />
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
 * Related things as a section of a detail pane. `-mx-2` gives the rows' hover padding back to the
 * margin, so their words line up with the pane's other labels.
 */
export function LinkedSection({ of, types, className = '' }: Linked & { className?: string }) {
  return (
    <section aria-label="Linked" className={`border-t border-line pt-3 ${className}`}>
      <div className="-mx-2">
        <span className="block px-2 pb-1 text-meta text-muted">Linked</span>
        <LinkList of={of} types={types} />
      </div>
    </section>
  )
}

/** The line of why: the note written by hand, or the sentence that mentioned it. */
export const whyOf = (item: Item): string | null => item.note ?? item.excerpt

/** One thing at the far end of a relation, with its why at the end of the line. */
function LinkedLine({ item }: { item: Item }) {
  const where = useRegistry().relationFor(item.type)
  const Fact = where.Fact
  const why = whyOf(item)
  return (
    <Link
      to={where.to(item.id)}
      data-linked={item.id}
      className="flex min-w-0 flex-1 items-baseline gap-2 rounded-control px-2 py-1.5 text-ui text-ink hover:bg-hover"
    >
      <span className="min-w-0 flex-[2] truncate">{item.title}</span>
      {Fact && (
        <span className="min-w-0 shrink truncate text-meta text-muted">
          <Fact thing={item} />
        </span>
      )}
      {why && <span className="min-w-0 shrink truncate text-meta text-subtle">{why}</span>}
    </Link>
  )
}
