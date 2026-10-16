import { Link } from 'react-router-dom'
import { Icon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { type Item, type Linked, useLinked } from './useLinked'

/** The linked things as one list, a small heading per kind: a detail pane's. */
export function LinkList({ of, types }: Linked) {
  const { groups, unlink, add, unshown } = useLinked(of, types)
  if (unshown !== undefined) return unshown
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
                <LinkedLine item={item} />
                {/* Only edges in the shell's table unlink; a task's project is required. */}
                {item.linkId && (
                  <button
                    type="button"
                    disabled={unlink.isPending}
                    onClick={() => unlink.mutate(item.linkId!)}
                    aria-label={`Unlink ${item.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-subtle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-hover hover:text-ink disabled:opacity-50 [@media(hover:none)]:opacity-100"
                  >
                    <Icon glyph="close" className="h-3 w-3" strokeWidth={1.8} />
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
export function LinkedSection({ of, types, className = '' }: Linked & { className?: string }) {
  return (
    <section aria-label="Linked" className={`border-t border-rule pt-3 ${className}`}>
      <div className="-mx-2">
        <span className="block px-2 pb-1 text-xs text-ink-muted">Linked</span>
        <LinkList of={of} types={types} />
      </div>
    </section>
  )
}

/** One thing at the far end of an edge, with the edge's own word at the end of the line. */
function LinkedLine({ item }: { item: Item }) {
  const where = useRegistry().relationFor(item.type)
  return (
    <Link
      to={where.to(item.id)}
      data-linked={item.id}
      className="flex min-w-0 flex-1 items-baseline gap-2 rounded-md px-2 py-1.5 text-sm text-ink hover:bg-hover"
    >
      <span className="min-w-0 flex-[2] truncate">{item.title}</span>
      {item.detail && (
        <span className="min-w-0 shrink truncate text-xs text-ink-muted">{item.detail}</span>
      )}
      {item.label && <span className="shrink-0 text-xs text-ink-subtle">{item.label}</span>}
    </Link>
  )
}
