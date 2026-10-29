import type { ReactNode } from 'react'
import { useSaveGate } from '../../../platform/http/online'
import { BUTTON, GATED } from '../../../platform/ui/buttonStyles'

/**
 * A row's one small action that saves (Start, Plan): greyed while offline, its hover saying why
 * (FR-033).
 */
export function RowAction({
  label,
  onPress,
  className = '',
  children,
}: {
  label: string
  onPress: () => void
  className?: string
  children: ReactNode
}) {
  const save = useSaveGate()
  return (
    <button
      type="button"
      onClick={save.gate(onPress)}
      {...save.props}
      aria-label={label}
      className={`${BUTTON.small} h-6.5 px-2.5 text-meta ${GATED} ${className}`}
    >
      {children}
    </button>
  )
}
