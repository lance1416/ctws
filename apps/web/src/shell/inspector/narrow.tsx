import type { ObjectType } from '@ctws/contracts'
import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { IconComponent } from '../../platform/ui/icons'
import { useInspector } from '../layout/inspectorAddress'
import { useRegistry } from '../registry'

/** A thing a narrow page opens: its kind and id. */
export type Inspectable = { type: ObjectType | 'list'; id: string; at?: string }

/**
 * What a narrow page may ask of the inspector it is in: open a linked thing in its place (FR-022),
 * and say its own name, for the "‹" back to it. Null outside the inspector.
 */
export const InspectorContext = createContext<{
  /**
   * Show it in the inspector's place; `among`, the list it was opened from, for ↑ ↓ and "3 of 7";
   * `act`, that list's action for a row, which the opened page offers too (U-29).
   */
  go: (thing: Inspectable, among?: readonly Inspectable[], act?: ListAct) => void
  /** The list's action for what is shown, when it was opened from one. */
  act?: ReactNode
  /** Back to what was shown before: a list, once its action has taken the row off it. */
  back: () => void
  name: (title: string) => void
} | null>(null)

/** A list's action for one of its rows, given the row; back when it has acted. */
export type ListAct = (thing: Inspectable, back: () => void) => ReactNode

/** Opening a thing in the inspector's place, from inside it; null outside the inspector. */
export const useInspectorGo = () => useContext(InspectorContext)?.go ?? null

/** The action of the list this was opened from, to put under its facts (U-29). */
export const useListAct = () => useContext(InspectorContext)?.act ?? null

/** A narrow page says what it is called, for the next one's way back to it. */
export function useNarrowName(title: string | undefined) {
  const inspector = useContext(InspectorContext)
  useEffect(() => {
    if (title) inspector?.name(title)
  }, [inspector, title])
}

/**
 * A linked thing: inside the inspector it opens there, in place of what is shown (FR-022);
 * anywhere else it is a link to its page.
 */
export function InspectLink({
  thing,
  to,
  className,
  children,
}: {
  thing: Inspectable
  to: string
  className?: string | undefined
  children: ReactNode
}) {
  const inspector = useContext(InspectorContext)
  return inspector ? (
    <button
      type="button"
      onClick={() => inspector.go(thing)}
      className={`text-left ${className ?? ''}`}
    >
      {children}
    </button>
  ) : (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}

/**
 * A narrow page's head (artboard 33): its mark on the left, the name in 18/26 over two lines at
 * most, and under it the full page's tags (a title, an organisation, a date, a state).
 */
export function NarrowHead({
  mark,
  title,
  tags,
}: {
  mark: ReactNode
  title: string
  tags?: ReactNode
}) {
  useNarrowName(title)
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 px-4 pt-4 pb-3">
      <span className="flex min-h-6.5 items-center">{mark}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="line-clamp-2 text-subject text-ink">{title}</h2>
        {tags && <div className="flex flex-wrap items-center gap-1.5 text-meta">{tags}</div>}
      </div>
    </div>
  )
}

/** The profile's facts as rows: a 16 icon, a 76 label, the value. A row with no value is left out. */
export function PropRows({ children }: { children: ReactNode }) {
  return <dl className="flex flex-col gap-1 px-4 pb-3">{children}</dl>
}

export function PropRow({
  icon: Icon,
  label,
  children,
  action,
}: {
  icon: IconComponent
  label: string
  children: ReactNode
  /** A button the full page has beside this fact (Join). */
  action?: ReactNode
}) {
  const none = children === null || children === undefined || children === '' || children === false
  // A row with a button of its own stays for the button (Join with no place written).
  if (none && !action) return null
  return (
    <div className="grid min-h-8 grid-cols-[16px_76px_minmax(0,1fr)_auto] items-center gap-x-2.5 text-ui">
      <Icon size={16} aria-hidden="true" className="text-muted" />
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-ink">{children}</dd>
      {action ?? <span />}
    </div>
  )
}

export type NarrowBlockOf = {
  key: string
  title: string
  /** How many, beside the name; none for a block that is not a count. */
  count?: ReactNode
  /** Nothing in it: the block is one line, after the others (FR-011). */
  empty?: string | null
  /** Its "All N", opening the full page at this block; when it holds more than it shows. */
  all?: { label: string; to: string } | null
  /** Under every other block, the empty ones too: the timeline, as on the full page (I-02). */
  last?: boolean
  body: ReactNode
}

/**
 * A narrow page's blocks (artboard 33): no card borders, a rule between one and the next, a head
 * of its name and count; the empty ones after, a line each; the timeline under them all.
 */
export function NarrowBlocks({ blocks }: { blocks: readonly (NarrowBlockOf | null | false)[] }) {
  const shown = blocks.filter((b): b is NarrowBlockOf => !!b)
  const full = shown.filter((b) => !b.empty && !b.last)
  const empty = shown.filter((b) => b.empty)
  const last = shown.filter((b) => b.last && !b.empty)
  const block = (b: NarrowBlockOf) => (
    <section
      key={b.key}
      aria-label={b.title}
      className="flex flex-col gap-1.5 border-t border-line px-4 py-3"
    >
      <h3 className="flex items-center gap-2 text-ui font-medium text-ink">
        {b.title}
        {b.count !== undefined && (
          <span className="text-meta font-normal text-muted tabular-nums">{b.count}</span>
        )}
      </h3>
      {b.body}
      {b.all && (
        <Link to={b.all.to} className="pl-7 text-meta text-muted hover:text-ink">
          {b.all.label}
        </Link>
      )}
    </section>
  )
  return (
    <div className="flex flex-col">
      {full.map(block)}
      {empty.map((b) => (
        <section
          key={b.key}
          aria-label={b.title}
          className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-ui"
        >
          <h3 className="font-medium text-ink">{b.title}</h3>
          <span className="text-meta text-subtle">{b.empty}</span>
        </section>
      ))}
      {last.map(block)}
    </div>
  )
}

/** One row of a narrow block: a mark, the name, one fact (DES-001: three columns at most). */
export function NarrowRow({
  mark,
  thing,
  to,
  title,
  fact,
}: {
  mark: ReactNode
  thing: Inspectable
  to: string
  title: ReactNode
  fact?: ReactNode
}) {
  return (
    <li className="grid min-h-8 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2.5">
      <span className="flex items-center justify-center">{mark}</span>
      <InspectLink
        thing={thing}
        to={to}
        className="min-w-0 truncate text-ui text-ink hover:underline"
      >
        {title}
      </InspectLink>
      <span className="min-w-0 text-meta text-muted">{fact}</span>
    </li>
  )
}

/**
 * A linked thing on a full page (FR-022): a link to its page, which a plain click opens in the
 * inspector instead, where its kind has a narrow page; the page you are on stays put.
 */
export function OpensBeside({
  thing,
  to,
  className,
  children,
  ...rest
}: {
  thing: Inspectable
  to: string
  className?: string
  title?: string
  children: ReactNode
} & Record<`data-${string}`, string>) {
  const inside = useContext(InspectorContext)
  const narrow = useNarrowFor(thing)
  const { show } = useInspector()
  if (inside)
    return (
      <InspectLink thing={thing} to={to} className={className}>
        {children}
      </InspectLink>
    )
  return (
    <Link
      to={to}
      className={className}
      onClick={(e) => {
        if (!narrow || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        show(thing)
      }}
      {...rest}
    >
      {children}
    </Link>
  )
}

/** Whether the inspector can show it: a full list, or a thing whose kind has a narrow page. */
function useNarrowFor(thing: Inspectable): boolean {
  const registry = useRegistry()
  return thing.type === 'list' || !!registry.relationFor(thing.type).Narrow
}

/** The occurrence an address names (`?at=`), for a row that links one meeting's day. */
export function atOf(to: string): string | undefined {
  const query = to.split('?')[1]
  return query ? (new URLSearchParams(query).get('at') ?? undefined) : undefined
}

/**
 * A block's "All N" (FR-011 rule 3, FR-015): its full list, opened in the inspector beside the
 * page, which stays put. `list` is its name in the address (`?inspect=list:<list>`).
 */
export function AllInInspector({
  list,
  count,
  className,
}: {
  list: string
  count: number
  className: string
}) {
  const { show } = useInspector()
  return (
    <button type="button" onClick={() => show({ type: 'list', id: list })} className={className}>
      All {count}
    </button>
  )
}

/** Opens a thing in the inspector from a page: a phone's sheet, the desk's column (FR-022, FR-088). */
export function useShowInInspector(): (thing: Inspectable) => void {
  return useInspector().show
}
