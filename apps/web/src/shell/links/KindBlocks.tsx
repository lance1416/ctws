import type { ObjectType } from '@ctws/contracts'
import { useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../platform/ui/Block'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CloseIcon, NewIcon, type Kind } from '../../platform/ui/icons'
import type { Creator, OwnThings } from '../contract'
import { NewContext } from '../creates'
import { useRegistry } from '../registry'
import { KIND_WORDS } from '../search/view'
import { LinkedRow } from './LinkedRow'
import { type Item, useLinked } from './useLinked'

/** "an organisation", "a note": one of a kind, as a button's name says it. */
const aOne = (kind: ObjectType) => {
  const one = KIND_WORDS[kind].one.toLocaleLowerCase()
  return `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}`
}

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
  /** What an empty block says. */
  none: string
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
 * A thing's blocks, a kind each (FR-011, FR-055, FR-061): a module's own things with it first
 * (a project's meetings, the reading a person recommended), then what is only linked to it by
 * hand. The full blocks come first, `full` of them; an empty one is its head, saying what `none`
 * says of its kind. A block is headed by its kind's plural unless `titles` names it otherwise. A
 * block's + makes a new thing where `creatorFor` names a creator of its kind, and links one
 * otherwise.
 */
export function useKindBlocks({
  of,
  kinds,
  owned,
  creatorFor = () => null,
  none = () => 'None yet',
  titles = {},
}: {
  of: { type: ObjectType; id: string }
  kinds: readonly ObjectType[]
  owned: readonly ({ kind: ObjectType } & OwnThings)[]
  creatorFor?: (kind: ObjectType) => Creator | null
  none?: (kind: ObjectType) => string
  titles?: Partial<Record<ObjectType, string>>
}): { blocks: ReactNode[]; full: number; picker: ReactNode } {
  const registry = useRegistry()
  const openNew = useContext(NewContext)
  const { links, groups, unlink, setAdding, picker } = useLinked(of, kinds)
  const linkedOf = new Map(groups.map((g) => [g.type, g.items]))

  const blocks: KindBlockProps[] = kinds.map((kind) => {
    const where = registry.relationFor(kind)
    const mine = owned.find((o) => o.kind === kind)
    const things: Row[] = (mine?.things ?? []).map((t) => ({ ...t, to: t.to ?? where.to(t.id) }))
    const linked = (linkedOf.get(kind) ?? []).filter(
      (item) => !things.some((t) => t.id === item.id),
    )
    const creator = creatorFor(kind)
    return {
      kind,
      title: titles[kind] ?? where.plural,
      none: none(kind),
      things,
      linked,
      failed: (mine?.isError ?? false) || links.isError,
      onRetry: () => {
        mine?.retry()
        void links.refetch()
      },
      add: creator
        ? { label: `New ${creator.label.toLocaleLowerCase()}`, run: () => openNew(creator) }
        : { label: `Link ${aOne(kind)}`, run: () => setAdding(kind) },
      onUnlink: (id) => unlink.mutate(id),
      unlinking: unlink.isPending,
    }
  })
  const size = (b: KindBlockProps) => b.things.length + b.linked.length
  const full = blocks.filter((b) => size(b) > 0)
  return {
    blocks: [...full, ...blocks.filter((b) => size(b) === 0)].map((b) => (
      <KindBlock key={b.kind} {...b} />
    )),
    full: full.length,
    picker,
  }
}

function KindBlock({
  kind,
  title,
  none,
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
      empty={rows.length === 0 && !failed ? none : null}
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
  // A kind with no word to lead with (reading) gives its title the room.
  const lead = row.initials || row.lead !== undefined
  return (
    <Link
      to={row.to}
      data-linked={row.id}
      className={`grid min-h-9 min-w-0 flex-1 items-center gap-x-3 px-3 text-ui text-ink hover:bg-hover ${
        lead ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
      }`}
    >
      {row.initials ? (
        <Avatar initials={row.initials} />
      ) : (
        lead && (
          // As wide as "Nov 21 10:00", so the titles after a weekday and after a date line up.
          <span className="min-w-[12ch] font-mono text-meta whitespace-nowrap text-muted">
            {row.lead ?? ''}
          </span>
        )
      )}
      <span className="truncate">{row.title}</span>
      <span className="min-w-0 truncate text-meta text-muted">{row.fact ?? ''}</span>
    </Link>
  )
}
