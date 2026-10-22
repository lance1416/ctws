import type { ObjectType, ProjectId } from '@ctws/contracts'
import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../platform/ui/Block'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { inColumns } from '../../platform/ui/columns'
import { CloseIcon, NewIcon, type Kind } from '../../platform/ui/icons'
import { NewContext } from '../creates'
import { LinkedRow } from '../links/LinkedRow'
import { type Item, useLinked } from '../links/useLinked'
import { useRegistry } from '../registry'

/** A project's blocks in FR-055's order; a kind no module draws yet is left out. */
const ORDER: readonly ObjectType[] = [
  'meeting',
  'communication',
  'person',
  'organisation',
  'reading',
  'note',
]

/** A block shows this many rows; the rest wait behind a line that says how many (FR-011). */
const SHOWN = 5

/** One row: a module's own thing in the project, or a thing linked to it by hand. */
type Row = {
  id: string
  title: string
  to: string
  lead?: string | null
  initials?: string | null
  fact?: string | null
}

type KindBlockProps = {
  kind: Kind
  title: string
  /** The module's own things first, then what is only linked. */
  things: Row[]
  linked: Item[]
  failed: boolean
  onRetry: () => void
  add: { label: string; run: () => void }
  onUnlink: (id: Item['relationId']) => void
  unlinking: boolean
}

/**
 * THE PROJECT'S BLOCKS (FR-055, DES-001 section 4): the meetings coming up, who is waiting for a
 * reply, its people, its organisations, its reading and its notes, a block each. Beside the tree
 * when the page has columns to spare, one block a column; under it otherwise, two across. A block
 * with nothing in it is its head, after the full ones; its + makes a new thing in the project, or
 * links one where its kind does not belong to a project.
 */
export function ProjectLinked({
  projectId,
  columns,
  beside,
}: {
  projectId: ProjectId
  columns: number
  beside: boolean
}) {
  const registry = useRegistry()
  const openNew = useContext(NewContext)
  const kinds = ORDER.filter((k) => registry.relations.some((r) => r.type === k))
  const { links, groups, unlink, setAdding, picker } = useLinked(
    { type: 'project', id: projectId },
    kinds,
  )
  // One hook per module that lists its own things: the registry's list is fixed.
  const owned = registry.projectThings.map((t) => ({ kind: t.kind, ...t.useThings(projectId) }))
  const linkedOf = new Map(groups.map((g) => [g.type, g.items]))

  const blocks: KindBlockProps[] = kinds.map((kind) => {
    const where = registry.relationFor(kind)
    const mine = owned.find((o) => o.kind === kind)
    const things: Row[] = (mine?.things ?? []).map((t) => ({ ...t, to: t.to ?? where.to(t.id) }))
    const linked = (linkedOf.get(kind) ?? []).filter(
      (item) => !things.some((t) => t.id === item.id),
    )
    const creator = mine && registry.creates.find((c) => c.kind === kind)
    return {
      kind,
      title: where.plural,
      things,
      linked,
      failed: (mine?.isError ?? false) || links.isError,
      onRetry: () => {
        mine?.retry()
        void links.refetch()
      },
      add: creator
        ? { label: `New ${creator.label.toLocaleLowerCase()}`, run: () => openNew(creator) }
        : { label: `Link a ${where.plural.toLocaleLowerCase()}`, run: () => setAdding(kind) },
      onUnlink: (id) => unlink.mutate(id),
      unlinking: unlink.isPending,
    }
  })
  const size = (b: KindBlockProps) => b.things.length + b.linked.length
  const nodes = [...blocks.filter((b) => size(b) > 0), ...blocks.filter((b) => size(b) === 0)].map(
    (b) => <KindBlock key={b.kind} {...b} />,
  )

  return (
    <>
      {beside ? (
        inColumns(nodes, columns).map((column, i) => (
          <div key={i} data-project-side className="flex min-w-0 flex-col gap-3">
            {column}
          </div>
        ))
      ) : (
        <div
          data-project-under
          className="col-span-full grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-2"
        >
          {nodes}
        </div>
      )}
      {/* The picker, mounted by the hook while a block's + links a thing. */}
      {picker}
    </>
  )
}

function KindBlock({
  kind,
  title,
  things,
  linked,
  failed,
  onRetry,
  add,
  onUnlink,
  unlinking,
}: KindBlockProps) {
  const [all, setAll] = useState(false)
  const rows: ReactNode[] = [
    ...things.map((t) => (
      <li key={t.id} className="flex min-w-0">
        <ThingRow row={t} />
      </li>
    )),
    ...linked.map((item) => (
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
    )),
  ]
  const shown = all ? rows : rows.slice(0, SHOWN)
  const more = rows.length - shown.length
  return (
    <Block
      kind={kind}
      title={title}
      count={rows.length}
      empty={rows.length === 0 && !failed ? 'None yet' : null}
      actions={
        <button
          type="button"
          onClick={add.run}
          aria-label={add.label}
          title={add.label}
          className={ICON_BUTTON}
        >
          <NewIcon size={16} aria-hidden="true" />
        </button>
      }
    >
      {failed ? (
        <BlockFailed what={title.toLocaleLowerCase()} onRetry={onRetry} />
      ) : (
        <ul className="flex flex-col py-1.5">{shown}</ul>
      )}
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

/**
 * A module's own thing: first a person's avatar or a word or two (a meeting's day and time), then
 * the title, then a fact.
 */
function ThingRow({ row }: { row: Row }) {
  return (
    <Link
      to={row.to}
      data-linked={row.id}
      className="grid min-h-9 min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-3 text-ui text-ink hover:bg-hover"
    >
      {row.initials ? (
        <Avatar initials={row.initials} />
      ) : (
        <span className="font-mono text-meta whitespace-nowrap text-muted">{row.lead ?? ''}</span>
      )}
      <span className="truncate">{row.title}</span>
      <span className="min-w-0 truncate text-meta text-muted">{row.fact ?? ''}</span>
    </Link>
  )
}
