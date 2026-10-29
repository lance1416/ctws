import { OpensBeside } from '../inspector/narrow'
import { useRegistry } from '../registry'
import { whyOf } from './Links'
import type { Item } from './useLinked'

/** One linked thing: its title, where it belongs, and the line of why at the end. */
export function LinkedRow({ item }: { item: Item }) {
  const where = useRegistry().relationFor(item.type)
  const Fact = where.Fact
  const why = whyOf(item)
  return (
    <OpensBeside
      thing={{ type: item.type, id: item.id }}
      to={where.to(item.id)}
      data-linked={item.id}
      className="grid min-h-9 max-lg:min-h-11 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-ui text-ink"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{item.title}</span>
        {why && <span className="truncate text-meta text-subtle">{why}</span>}
      </span>
      {Fact && (
        <span className="min-w-0 truncate text-meta text-muted">
          <Fact thing={item} />
        </span>
      )}
    </OpensBeside>
  )
}
