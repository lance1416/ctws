import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { Block, BlockFailed, SkeletonRows } from '../../platform/ui/Block'
import { CloseIcon, NewIcon, type Kind } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { whyOf } from './Links'
import { type Item, type Linked, useLinked } from './useLinked'

/** A block shows this many rows; the rest wait behind a line that says how many (FR-011). */
const SHOWN = 5

/**
 * THE LINKED BLOCKS (FR-011, FR-042): what a page's thing is related to, one block per kind,
 * each with its count and its own `+`. Five rows, then "N more"; a kind with nothing shrinks to
 * its head and goes after the full ones. A failure stays in its block.
 */
export function LinkBlocks({ of, types }: Linked) {
  const registry = useRegistry()
  // Each block carries its own `+`, so the list's own "+ Link" is not drawn here.
  const { links, groups, unlink, setAdding, add } = useLinked(of, types)
  const kinds = (types ?? registry.relations.map((r) => r.type)).filter((t) => t !== of.type)
  const byKind = new Map(groups.map((g) => [g.type, g.items]))
  const full = kinds.filter((k) => (byKind.get(k)?.length ?? 0) > 0)
  const empty = kinds.filter((k) => (byKind.get(k)?.length ?? 0) === 0)

  if (links.isError)
    return (
      <Block title="Linked">
        <BlockFailed what="linked things" onRetry={() => void links.refetch()} />
      </Block>
    )
  if (links.isPending)
    return (
      <div className="flex flex-col gap-3">
        {kinds.slice(0, 2).map((k) => (
          <Block key={k} kind={k} title={registry.relationFor(k).plural}>
            <SkeletonRows rows={2} />
          </Block>
        ))}
      </div>
    )

  return (
    <div className="flex flex-col gap-3">
      {[...full, ...empty].map((kind) => {
        const where = registry.relationFor(kind)
        const items = byKind.get(kind) ?? []
        return (
          <KindBlock
            key={kind}
            kind={kind}
            title={where.plural}
            items={items}
            onAdd={() => setAdding(kind)}
            onUnlink={(id) => unlink.mutate(id)}
            unlinking={unlink.isPending}
          />
        )
      })}
      {/* The picker, mounted by the hook while a `+` is pressed. */}
      {add}
    </div>
  )
}

function KindBlock({
  kind,
  title,
  items,
  onAdd,
  onUnlink,
  unlinking,
}: {
  kind: Kind
  title: string
  items: Item[]
  onAdd: () => void
  onUnlink: (id: Item['relationId']) => void
  unlinking: boolean
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, SHOWN)
  const more = items.length - shown.length
  return (
    <Block
      kind={kind}
      title={title}
      count={items.length}
      empty={items.length === 0 ? 'None yet' : null}
      actions={
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Link a ${title.toLocaleLowerCase()}`}
          title={`Link a ${title.toLocaleLowerCase()}`}
          className={ICON_BUTTON}
        >
          <NewIcon size={16} aria-hidden="true" />
        </button>
      }
    >
      <ul className="flex flex-col py-1.5">
        {shown.map((item) => (
          <li key={item.relationId} className="group flex min-w-0 items-center pr-1.5">
            <LinkedRow item={item} />
            {/* A mention goes with its sentence; only a relation made by hand unlinks here. */}
            {item.origin === 'manual' && (
              <button
                type="button"
                disabled={unlinking}
                onClick={() => onUnlink(item.relationId)}
                aria-label={`Unlink ${item.title}`}
                className={`${ICON_BUTTON} opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100`}
              >
                <CloseIcon size={14} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex h-9 w-full items-center border-t border-line px-3 text-ui text-muted hover:bg-hover hover:text-ink"
        >
          {more} more
        </button>
      )}
    </Block>
  )
}

/** One linked thing: its title, where it belongs, and the line of why at the end. */
function LinkedRow({ item }: { item: Item }) {
  const where = useRegistry().relationFor(item.type)
  const detail = where.describe?.(item) ?? null
  const why = whyOf(item)
  return (
    <Link
      to={where.to(item.id)}
      data-linked={item.id}
      className="grid min-h-9 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-ui text-ink hover:bg-hover"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{item.title}</span>
        {why && <span className="truncate text-meta text-subtle">{why}</span>}
      </span>
      {detail && <span className="truncate text-meta text-muted">{detail}</span>}
    </Link>
  )
}
