import type { ComponentType, ReactNode } from 'react'
import { useDelayed } from '../time/useDelayed'
import { BUTTON } from './buttonStyles'
import { AlertIcon, KIND_ICON, RetryIcon, type IconComponent, type Kind } from './icons'
import { KIND_TEXT, KIND_TINT } from './kinds'

/**
 * The container every page is built from. An empty block shrinks to its head and keeps its New.
 */
export function Block({
  kind,
  badge,
  title,
  count,
  actions,
  empty,
  keepsSize = false,
  children,
  className = '',
}: {
  /** The kind the block holds, for its badge; none for a block of its own (a timeline). */
  kind?: Kind
  /** A badge of its own where the block holds a state, not a kind (Today's Overdue). */
  badge?: { icon: ComponentType<{ size?: number; className?: string }>; tint: string }
  title: string
  /** How many, in the block's words: "9 open", "3 this week", or just the number. */
  count?: ReactNode
  /** Views and actions, at the end of the head. */
  actions?: ReactNode
  /** The words when there is nothing: "None yet". The block shrinks to its head. */
  empty?: string | null
  /**
   * A block whose size is its place's, a workbench widget's: empty, it keeps its size and says so
   * on a line under its head.
   */
  keepsSize?: boolean
  children?: ReactNode
  className?: string
}) {
  const Icon = badge?.icon ?? (kind ? KIND_ICON[kind] : null)
  const emptyInHead = empty && !keepsSize
  const tint = badge?.tint ?? (kind ? `${KIND_TINT[kind]} ${KIND_TEXT[kind]}` : '')
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col overflow-hidden rounded-container border border-line bg-panel ${className}`}
    >
      <BlockHead
        icon={Icon}
        tint={tint}
        title={title}
        ruled={!emptyInHead}
        aside={
          emptyInHead && (
            // Cut short rather than wrapped; on a phone a long name leaves no room, so it goes
            // under the name.
            <span className="min-w-0 truncate text-meta text-muted max-lg:whitespace-normal">
              {empty}
            </span>
          )
        }
        count={emptyInHead ? undefined : count}
        actions={actions}
      />
      {empty && keepsSize && <p className="px-4 py-3 text-ui text-muted">{empty}</p>}
      {!empty && children}
    </section>
  )
}

/**
 * A section of a panel that reads as a block takes the same head, so every name sits on the same
 * line from its edge.
 */
export function BlockHead({
  icon: Icon,
  tint,
  title,
  level = 'h2',
  ruled = true,
  aside,
  count,
  actions,
}: {
  icon: IconComponent | ComponentType<{ size?: number; className?: string }> | null
  tint: string
  title: string
  level?: 'h2' | 'h3'
  /** A line under it, over what the block holds. */
  ruled?: boolean
  /** Said beside the name, in place of a count (an empty block's words). */
  aside?: ReactNode
  count?: ReactNode
  actions?: ReactNode
}) {
  const Heading = level
  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3 max-lg:h-auto max-lg:min-h-10 max-lg:flex-wrap max-lg:py-1.5 ${ruled ? 'border-b border-line' : ''}`}
    >
      {Icon && (
        <span
          aria-hidden="true"
          className={`inline-grid size-6 shrink-0 place-items-center rounded-control ${tint}`}
        >
          <Icon size={14} />
        </span>
      )}
      <span className="flex min-w-0 items-center gap-2 max-lg:flex-wrap max-lg:gap-y-0">
        <Heading className="shrink-0 text-ui font-medium whitespace-nowrap text-ink">
          {title}
        </Heading>
        {aside}
      </span>
      {count !== undefined && (
        <span data-count className="text-meta text-muted tabular-nums">
          {count}
        </span>
      )}
      <span aria-hidden="true" className="flex-1" />
      {actions}
    </div>
  )
}

/** Grey rows in a block's own shape, after the first 300 ms. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  const shown = useDelayed()
  if (!shown) return <div className="h-10" />
  return (
    <div aria-busy="true" className="flex flex-col gap-3.5 px-3 py-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="size-6 shrink-0 rounded-full bg-line" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span
              className="h-2.5 rounded-small bg-line"
              style={{ width: `${70 - (i % 3) * 12}%` }}
            />
            <span
              className="h-2 rounded-small bg-line opacity-60"
              style={{ width: `${40 + (i % 2) * 10}%` }}
            />
          </span>
          <span className="h-4.5 w-13 rounded-small bg-line" />
        </div>
      ))}
    </div>
  )
}

/** One block's failure stays in the block, with the way to try again. */
export function BlockFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-4">
      <p role="alert" className="flex flex-1 items-start gap-2 text-ui text-stop-t">
        <AlertIcon size={14} aria-hidden="true" className="mt-0.75 shrink-0" />
        Couldn’t load the {what}.
      </p>
      <button type="button" onClick={onRetry} className={`${BUTTON.small} h-7 px-2.5 text-meta`}>
        <RetryIcon size={14} aria-hidden="true" />
        Try again
      </button>
    </div>
  )
}
