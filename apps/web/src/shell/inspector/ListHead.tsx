import type { ComponentType, ReactNode } from 'react'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CloseIcon } from '../../platform/ui/icons'
import { useCloseInspector } from './close'
import { useNarrowName } from './narrow'

/**
 * A FULL LIST'S HEAD IN THE INSPECTOR (artboard 32): the block's own, its icon on its tint, its
 * name and how many, the block's action (Overdue's "Move all to…"), and close on the right. Its
 * name is the way back from a row opened in its place.
 */
export function ListHead({
  badge,
  title,
  count,
  action,
}: {
  badge: { icon: ComponentType<{ size?: number; className?: string }>; tint: string }
  title: string
  count: number
  action?: ReactNode
}) {
  useNarrowName(title)
  const close = useCloseInspector()
  const Icon = badge.icon
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3">
      <span
        aria-hidden="true"
        className={`inline-grid size-6 shrink-0 place-items-center rounded-control ${badge.tint}`}
      >
        <Icon size={14} />
      </span>
      <h2 className="text-ui font-medium whitespace-nowrap text-ink">{title}</h2>
      <span className="text-meta text-subtle tabular-nums">{count}</span>
      <span aria-hidden="true" className="flex-1" />
      {action}
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        title="Close  Esc"
        className={ICON_BUTTON}
      >
        <CloseIcon size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
