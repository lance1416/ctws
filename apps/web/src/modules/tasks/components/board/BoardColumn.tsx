import type { ChildCounts, TaskId, TaskStatus } from '@ctws/contracts'
import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import {
  BarCollapseIcon,
  BarExpandIcon,
  CollapseIcon,
  ExpandIcon,
} from '../../../../platform/ui/icons'
import type { BoardCard, ShownGroup } from '../../logic/board/boardColumns'
import { STATUS_LABEL } from '../../logic/status'
import { ProgressSquare } from '../ProgressSquare'
import { StatusMark } from '../StatusMark'

/** A column the dragged card is over: its grey goes to `select`, laid over it. */
const OVER = 'shadow-[inset_0_0_0_100vmax_var(--color-select)]'

/**
 * ONE STATUS'S COLUMN (FR-057, artboard 21): its head, then the project's own cards, then a group
 * per top-level parent, each with its fold, progress, name and count in this column. A column
 * with nothing in it is only its head.
 */
export function BoardColumn({
  status,
  count,
  groups,
  counts,
  top,
  bottom,
  onHide,
  card,
  onFold,
  onMore,
}: {
  status: TaskStatus
  count: number
  groups: readonly ShownGroup[]
  /** Every parent's leaves, for the progress at its group's head. */
  counts: ReadonlyMap<TaskId, ChildCounts>
  /** Above the cards: To do's "New task". */
  top?: ReactNode
  /** At the column's foot: Done's way to the review. */
  bottom?: ReactNode
  /** Folds a side column back to its strip. */
  onHide?: (() => void) | undefined
  card: (card: BoardCard) => ReactNode
  onFold: (root: TaskId) => void
  onMore: (root: TaskId | null) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const label = STATUS_LABEL[status]
  const HideIcon = status === 'cancelled' ? BarExpandIcon : BarCollapseIcon
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`board-${status}`}
      data-board-column={status}
      className={`flex min-w-0 flex-1 basis-0 flex-col rounded-block border border-line bg-chrome ${
        isOver ? OVER : ''
      }`}
    >
      <h3 className="flex h-10 shrink-0 items-center gap-2 pr-1.5 pl-3 text-ui">
        <span aria-hidden="true" className="flex">
          <StatusMark status={status} size={16} />
        </span>
        <span id={`board-${status}`} className="font-medium text-ink">
          {label}
        </span>
        {count > 0 && (
          <span data-count className="text-meta text-subtle tabular-nums">
            {count}
          </span>
        )}
        <span aria-hidden="true" className="flex-1" />
        {onHide && (
          <button
            type="button"
            aria-label={`Hide ${label}`}
            onClick={onHide}
            className="flex size-7 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-ink"
          >
            <HideIcon size={16} aria-hidden="true" />
          </button>
        )}
      </h3>
      <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
        {top}
        {groups.map((group) => {
          const root = group.root
          return (
            <div
              key={root?.id ?? 'own'}
              data-board-group={root?.id ?? 'own'}
              className="flex flex-col gap-2"
            >
              {root && (
                <button
                  type="button"
                  aria-expanded={group.open}
                  onClick={() => onFold(root.id)}
                  className="flex h-7.5 min-w-0 items-center gap-2 rounded-control px-1 text-left text-ui hover:bg-hover"
                >
                  {group.open ? (
                    <ExpandIcon size={14} aria-hidden="true" className="shrink-0 text-muted" />
                  ) : (
                    <CollapseIcon size={14} aria-hidden="true" className="shrink-0 text-muted" />
                  )}
                  {counts.get(root.id) && (
                    <ProgressSquare status={root.status} children={counts.get(root.id)!} />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{root.title}</span>
                  <span data-count className="text-meta text-subtle tabular-nums">
                    {group.count}
                  </span>
                </button>
              )}
              {group.cards.length > 0 && (
                <ul aria-label={root?.title} className="flex flex-col gap-2">
                  {group.cards.map(card)}
                </ul>
              )}
              {group.more > 0 && (
                <button
                  type="button"
                  onClick={() => onMore(root?.id ?? null)}
                  className={`flex h-7 items-center self-start rounded-control pr-1.5 text-meta font-medium text-muted hover:bg-hover hover:text-ink ${
                    root ? 'pl-7' : 'pl-1.5'
                  }`}
                >
                  {group.more} more
                </button>
              )}
            </div>
          )
        })}
        {bottom && <div className="mt-auto flex justify-center pt-1">{bottom}</div>}
      </div>
    </section>
  )
}

/**
 * A FOLDED SIDE COLUMN (FR-057): Backlog or Cancelled as a narrow strip with its mark, count and
 * name; opened with a click, and a card dropped on it takes its status. On a phone it lies flat.
 */
export function BoardStrip({
  status,
  count,
  stripRef,
  onShow,
}: {
  status: TaskStatus
  count: number
  stripRef: (el: HTMLButtonElement | null) => void
  onShow: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const label = STATUS_LABEL[status]
  return (
    <button
      ref={(el) => {
        setNodeRef(el)
        stripRef(el)
      }}
      type="button"
      aria-expanded={false}
      aria-label={count > 0 ? `${label}, ${count}` : label}
      data-board-strip={status}
      onClick={onShow}
      className={`flex shrink-0 items-center gap-2 rounded-block border border-line bg-chrome text-muted hover:bg-hover max-md:h-10 max-md:px-3 md:w-10 md:flex-col md:py-3 ${
        isOver ? OVER : ''
      }`}
    >
      <StatusMark status={status} size={14} />
      {count > 0 && <span className="text-meta text-subtle tabular-nums">{count}</span>}
      <span className="text-ui font-medium text-ink md:[writing-mode:vertical-rl]">{label}</span>
    </button>
  )
}
