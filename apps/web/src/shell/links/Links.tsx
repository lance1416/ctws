import { linkWords } from '@ctws/core'
import { Link } from 'react-router-dom'
import { BlockFailed } from '../../platform/ui/Block'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CloseIcon, KIND_ICON, NewIcon } from '../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TINT } from '../../platform/ui/kinds'
import { OpensBeside } from '../inspector/narrow'
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

/**
 * Related things as chips, the inspector's Linked (FR-056, artboard 8): each its kind's icon and
 * name on its kind's tint, opening where it lives; one linked by hand has an × to undo it. Who is
 * linked is the point here, so the sentence that mentioned them stays in the timeline.
 */
export function LinkedChips({ of, types }: Linked) {
  const { links, groups, unlink, setAdding, picker } = useLinked(of, types)
  const items = groups.flatMap((group) => group.items)
  return (
    <section aria-labelledby="linked-head" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 id="linked-head" className="text-ui font-medium text-ink">
          Linked
        </h3>
        {!links.isError && !links.isLoading && items.length === 0 && (
          <span className="text-meta text-subtle">None yet</span>
        )}
        <span aria-hidden="true" className="flex-1" />
        <button
          type="button"
          aria-label="Link something"
          onClick={() => setAdding('any')}
          className={ICON_BUTTON}
        >
          <NewIcon size={16} aria-hidden="true" />
        </button>
      </div>
      {links.isError ? (
        <BlockFailed what="links" onRetry={() => void links.refetch()} />
      ) : (
        items.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <li key={item.relationId}>
                <LinkedChip
                  item={item}
                  onUnlink={
                    item.origin === 'manual' && !unlink.isPending
                      ? () => unlink.mutate(item.relationId)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )
      )}
      {picker}
    </section>
  )
}

/** One linked thing as a chip; the × only on a relation made by hand. */
function LinkedChip({ item, onUnlink }: { item: Item; onUnlink: (() => void) | undefined }) {
  const where = useRegistry().relationFor(item.type)
  const Icon = KIND_ICON[item.type]
  return (
    <span
      data-linked={item.id}
      className={`group inline-flex h-5.5 max-w-full items-center rounded-control text-meta font-medium ${KIND_TINT[item.type]} ${KIND_ON_TINT[item.type]}`}
    >
      {/* In the inspector it takes the inspector's place, ‹ back to this; elsewhere it opens beside
          the page where its kind has a narrow page (FR-022). */}
      <OpensBeside
        thing={{ type: item.type, id: item.id }}
        to={where.to(item.id)}
        className={`inline-flex min-w-0 items-center gap-1.25 pl-2 hover:underline max-lg:tap ${onUnlink ? 'pr-1' : 'pr-2'}`}
      >
        <Icon size={12} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{item.title}</span>
      </OpensBeside>
      {onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          aria-label={`Unlink ${item.title}`}
          className="mr-0.5 grid size-4.5 shrink-0 place-items-center rounded-key opacity-60 hover:opacity-100 focus-visible:opacity-100"
        >
          <CloseIcon size={12} aria-hidden="true" />
        </button>
      )}
    </span>
  )
}

/** The line of why: the note written by hand, or the sentence that mentioned it. */
export const whyOf = (item: Item): string | null =>
  item.note ?? (item.excerpt === null ? null : linkWords(item.excerpt))

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
