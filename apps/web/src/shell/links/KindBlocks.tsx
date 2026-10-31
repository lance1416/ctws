import type { LinkCandidate, ObjectType } from '@ctws/contracts'
import { useContext, useState, type ComponentType, type ReactNode } from 'react'
import { Avatar } from '../../platform/ui/Avatar'
import { Block, BlockFailed } from '../../platform/ui/Block'
import { BUTTON, ICON_BUTTON, SWIPE } from '../../platform/ui/buttonStyles'
import { DeleteConfirm } from '../../platform/ui/DeleteConfirm'
import { SwipeRow } from '../../platform/ui/SwipeRow'
import { CloseIcon, NewIcon, type Kind } from '../../platform/ui/icons'
import type { Creator, Join, OwnThings } from '../contract'
import { NewContext } from '../creates'
import { useRegistry } from '../registry'
import { SearchDialog } from '../search/SearchDialog'
import { KIND_WORDS } from '../search/view'
import type { Makes } from './LinkDialog'
import { LinkedRow } from './LinkedRow'
import { linkedListOf } from '../inspector/LinkedList'
import { AllInInspector, atOf, OpensBeside, type ListAct } from '../inspector/narrow'
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
  mark?: ReactNode
  withInitials?: string | null
  fact?: string | null
  sub?: ReactNode
  trail?: ReactNode
}

type KindBlockProps = {
  /** Whose block it is, for its full list. */
  of: { type: ObjectType; id: string }
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
  /** A module's own row for what is linked, in place of the shell's. */
  Linked?: ComponentType<{ thing: LinkCandidate }>
  /** The head's count in the module's words; the number of rows otherwise. */
  count?: ReactNode
  /** An empty block's + says what it makes ("+ Meeting"), rather than an icon (FR-061). */
  addSays?: string
  /** Its own things join the page's subject: each row takes one off it (FR-055). */
  join?: Join
  /** What a row is taken off, in place of unlinking it: "project" (Remove from project). */
  removeFrom?: string
  /** The subject by name, for "Remove from Job hunt" on the thing's own page. */
  removeFromName?: string
}

/**
 * A thing's blocks, a kind each (FR-011, FR-055, FR-061): a module's own things with it first
 * (a project's meetings, the reading a person recommended), then what is only linked to it by
 * hand. The full blocks come first, `full` of them; an empty one is its head, saying what `none`
 * says of its kind. A block is headed by its kind's plural unless `titles` names it otherwise. A
 * block's + makes a new thing where `creatorFor` names a creator of its kind, and links one
 * otherwise; with `sayAdd`, an empty block's + says so in words. What is linked is drawn by the
 * kind's own row where `linkedRows` has one.
 */
export function useKindBlocks({
  of,
  kinds,
  owned,
  creatorFor = () => null,
  none = () => 'None yet',
  titles = {},
  linkedRows = [],
  sayAdd = false,
  makesFor = () => undefined,
  ofName,
}: {
  of: { type: ObjectType; id: string }
  kinds: readonly ObjectType[]
  owned: readonly ({ kind: ObjectType } & OwnThings)[]
  creatorFor?: (kind: ObjectType) => Creator | null
  none?: (kind: ObjectType) => string
  titles?: Partial<Record<ObjectType, string>>
  linkedRows?: readonly {
    kind: ObjectType
    Row: ComponentType<{ thing: LinkCandidate }>
    count?: (things: readonly LinkCandidate[]) => ReactNode
  }[]
  sayAdd?: boolean
  /** How a kind that is only linked makes a new one from its + (FR-055). */
  makesFor?: (kind: ObjectType) => Makes | undefined
  /** The subject's name, for what its blocks offer on a thing's own page: "Remove from Job hunt". */
  ofName?: string
}): { blocks: ReactNode[]; full: number; picker: ReactNode } {
  const registry = useRegistry()
  const openNew = useContext(NewContext)
  const { links, groups, unlink, setAdding, picker } = useLinked(of, kinds, makesFor)
  // The kind whose + is finding one to join the subject (FR-055).
  const [joining, setJoining] = useState<ObjectType | null>(null)
  const removeFrom = KIND_WORDS[of.type].one.toLocaleLowerCase()
  const linkedOf = new Map(groups.map((g) => [g.type, g.items]))

  const blocks: KindBlockProps[] = kinds.map((kind) => {
    const where = registry.relationFor(kind)
    const mine = owned.find((o) => o.kind === kind)
    const things: Row[] = (mine?.things ?? []).map((t) => ({ ...t, to: t.to ?? where.to(t.id) }))
    const linked = (linkedOf.get(kind) ?? []).filter(
      (item) => !things.some((t) => t.id === item.id),
    )
    const creator = creatorFor(kind)
    const own = linkedRows.find((r) => r.kind === kind)
    const join = mine?.join
    const adds = join !== undefined || makesFor(kind) !== undefined
    return {
      of,
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
      add: join
        ? { label: `Add ${aOne(kind)}`, run: () => setJoining(kind) }
        : creator
          ? { label: `New ${creator.label.toLocaleLowerCase()}`, run: () => openNew(creator) }
          : { label: `${adds ? 'Add' : 'Link'} ${aOne(kind)}`, run: () => setAdding(kind) },
      onUnlink: (id) => unlink.mutate(id),
      unlinking: unlink.isPending,
      ...(own ? { Linked: own.Row } : {}),
      ...(own?.count ? { count: own.count(linked) } : {}),
      ...(sayAdd ? { addSays: creator ? creator.label : 'Link' } : {}),
      ...(join ? { join } : {}),
      ...(adds ? { removeFrom } : {}),
      ...(ofName ? { removeFromName: ofName } : {}),
    }
  })
  const joinOf = joining ? blocks.find((b) => b.kind === joining) : undefined
  const size = (b: KindBlockProps) => b.things.length + b.linked.length
  const full = blocks.filter((b) => size(b) > 0)
  return {
    blocks: [...full, ...blocks.filter((b) => size(b) === 0)].map((b) => (
      <KindBlock key={b.kind} {...b} />
    )),
    full: full.length,
    picker: (
      <>
        {picker}
        {joinOf?.join && (
          <SearchDialog
            onClose={() => setJoining(null)}
            pick={{
              of,
              title: joinOf.add.label,
              only: joinOf.kind,
              asksWhy: false,
              leaveOut: joinOf.things.map((t) => t.id),
              onPick: (thing) => {
                joinOf.join!.add(thing.id)
                setJoining(null)
              },
              makes: {
                label: `New ${KIND_WORDS[joinOf.kind].one.toLocaleLowerCase()}`,
                run: (name) => {
                  setJoining(null)
                  joinOf.join!.make(name)
                },
              },
            }}
          />
        )}
      </>
    ),
  }
}

function KindBlock({
  of,
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
  Linked,
  count,
  addSays,
  join,
  removeFrom,
  removeFromName,
}: KindBlockProps) {
  const registry = useRegistry()
  const rows: ReactNode[] = [
    ...things.map((t) => (
      <li key={t.id}>
        {/* On a phone its ✕ is a swipe away, and the page it opens offers it too (DES-001). */}
        <SwipeRow
          actions={
            join && (
              <SwipeAction
                label={`Remove ${t.title} from ${removeFrom}`}
                disabled={join.busy}
                onClick={() => join.remove(t.id)}
              />
            )
          }
        >
          {/* The row's hover takes in its ✕, so the ✕ reads as the row's (N-08). */}
          <div className={`group flex min-w-0 items-center ${join ? 'pr-1.5 hover:bg-hover' : ''}`}>
            {/* With its ✕, the row takes the hover whole; the link adds none of its own (N-08). */}
            <ThingRow
              row={t}
              kind={kind}
              hover={!join}
              {...(join
                ? {
                    act: (_thing, done) => (
                      <RemoveFrom
                        name={t.title}
                        from={removeFromName ?? removeFrom ?? ''}
                        busy={join.busy}
                        onRemove={() => {
                          join.remove(t.id)
                          done()
                        }}
                      />
                    ),
                  }
                : {})}
            />
            {join && (
              <TakeOff
                label={`Remove ${t.title} from ${removeFrom}`}
                title={`Remove from ${removeFrom}`}
                disabled={join.busy}
                onClick={() => join.remove(t.id)}
              />
            )}
          </div>
        </SwipeRow>
      </li>
    )),
    ...linked.map((item) => (
      <li key={item.relationId}>
        <SwipeRow
          actions={
            item.origin === 'manual' && (
              <SwipeAction
                label={
                  removeFrom ? `Remove ${item.title} from ${removeFrom}` : `Unlink ${item.title}`
                }
                word={removeFrom ? 'Remove' : 'Unlink'}
                disabled={unlinking}
                onClick={() => onUnlink(item.relationId)}
              />
            )
          }
        >
          <div className="group flex min-w-0 items-center pr-1.5 hover:bg-hover">
            {Linked ? (
              <OpensBeside
                thing={{ type: item.type, id: item.id }}
                to={registry.relationFor(item.type).to(item.id)}
                data-linked={item.id}
                className="min-w-0 flex-1 px-3 max-lg:flex max-lg:min-h-11 max-lg:items-center"
              >
                <Linked thing={item} />
              </OpensBeside>
            ) : (
              <LinkedRow item={item} />
            )}
            {/* A mention goes with its sentence; only a relation made by hand unlinks here. */}
            {item.origin === 'manual' && (
              <TakeOff
                label={
                  removeFrom ? `Remove ${item.title} from ${removeFrom}` : `Unlink ${item.title}`
                }
                title={removeFrom ? `Remove from ${removeFrom}` : undefined}
                disabled={unlinking}
                onClick={() => onUnlink(item.relationId)}
              />
            )}
          </div>
        </SwipeRow>
      </li>
    )),
  ]
  const shown = rows.slice(0, SHOWN)
  return (
    <Block
      kind={kind}
      title={title}
      count={count ?? rows.length}
      empty={rows.length === 0 && !failed ? none : null}
      actions={
        rows.length === 0 && addSays ? (
          <button
            type="button"
            onClick={add.run}
            aria-label={add.label}
            className="inline-flex h-7 items-center gap-1 rounded-control px-2 text-ui text-muted hover:bg-hover hover:text-ink max-lg:min-h-11"
          >
            <NewIcon size={14} aria-hidden="true" />
            {addSays}
          </button>
        ) : (
          <button
            type="button"
            onClick={add.run}
            aria-label={add.label}
            title={add.label}
            className={ICON_BUTTON}
          >
            <NewIcon size={16} aria-hidden="true" />
          </button>
        )
      }
    >
      {failed ? (
        <BlockFailed what={title.toLocaleLowerCase()} onRetry={onRetry} />
      ) : (
        // Alone on a wide row, the rows go across in columns of 22rem, not one line the row's width
        // (FR-011 rule 2, U-19); a narrow block is one column as before.
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(22rem,100%),1fr))] py-1.5">
          {shown}
        </ul>
      )}
      {join?.error && (
        <p role="alert" className="px-3 pb-2 text-ui text-stop-t">
          {join.error}
        </p>
      )}
      {/* The rest in the inspector, the page staying put (FR-011 rule 3). */}
      {rows.length > SHOWN && (
        <AllInInspector
          list={linkedListOf(kind, of)}
          count={rows.length}
          className="flex h-9 max-lg:h-11 w-full items-center border-t border-line px-3 max-lg:h-11 text-ui text-muted hover:bg-hover hover:text-ink"
        />
      )}
    </Block>
  )
}

/** A row's way off the block, shown on hover: unlink it, or take it off the project. */
function TakeOff({
  label,
  title,
  disabled,
  onClick,
}: {
  label: string
  title?: string | undefined
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`${ICON_BUTTON} opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-lg:hidden [@media(hover:none)]:opacity-100`}
    >
      <CloseIcon size={14} aria-hidden="true" />
    </button>
  )
}

/**
 * A module's own thing: first a person's avatar or a word or two (a meeting's day and time), then
 * the title, then a fact.
 */
function ThingRow({
  row,
  kind,
  hover = true,
  act,
}: {
  row: Row
  kind: ObjectType
  hover?: boolean
  /** What its block offers to do with it, on the page it opens too. */
  act?: ListAct
}) {
  // A kind with no word to lead with (reading) gives its title the room.
  const lead = row.initials || row.mark || row.lead !== undefined
  return (
    <OpensBeside
      thing={{ type: kind, id: row.id, ...(atOf(row.to) ? { at: atOf(row.to)! } : {}) }}
      to={row.to}
      act={act}
      data-linked={row.id}
      className={`grid min-h-9 min-w-0 flex-1 items-center max-lg:min-h-11 gap-x-3 px-3 text-ui text-ink ${hover ? 'hover:bg-hover' : ''} ${
        lead ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
      }`}
    >
      {row.initials ? (
        <Avatar initials={row.initials} />
      ) : row.mark ? (
        <span className="flex text-muted">{row.mark}</span>
      ) : (
        lead && (
          // As wide as "Nov 21 10:00", so the titles after a weekday and after a date line up.
          <span className="flex min-w-[12ch] items-center gap-2.5 font-mono text-meta whitespace-nowrap text-muted">
            {row.lead ?? ''}
            {row.withInitials && <Avatar initials={row.withInitials} />}
          </span>
        )
      )}
      {/* On a phone, a row's two steps (FR-082). */}
      <span className="flex min-w-0 flex-col py-1.5">
        <span className="truncate max-lg:text-row">{row.title}</span>
        {row.sub && (
          <span className="truncate text-meta text-muted max-lg:text-row-sub">{row.sub}</span>
        )}
      </span>
      {row.trail ?? <span className="min-w-0 truncate text-meta text-muted">{row.fact ?? ''}</span>}
    </OpensBeside>
  )
}

/** What a row's swipe uncovers on a phone: its ✕ in words (DES-001). */
function SwipeAction({
  label,
  word = 'Remove',
  disabled,
  onClick,
}: {
  label: string
  word?: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={SWIPE.remove}
    >
      <CloseIcon size={16} aria-hidden="true" />
      {word}
    </button>
  )
}

/**
 * "Remove from Job hunt" at the foot of a thing opened from its project's block (DES-001): red,
 * framed, and asked first, from the foot on a phone.
 */
function RemoveFrom({
  name,
  from,
  busy,
  onRemove,
}: {
  name: string
  from: string
  busy: boolean
  onRemove: () => void
}) {
  const [asking, setAsking] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={`${BUTTON.destructive} w-full justify-center`}
      >
        Remove from {from}
      </button>
      {asking && (
        <DeleteConfirm
          label={`Remove ${name} from ${from}`}
          message={`Remove ${name} from ${from}? Nothing else about them changes.`}
          busy={busy}
          confirm={`Remove from ${from}`}
          onConfirm={() => {
            setAsking(false)
            onRemove()
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  )
}
