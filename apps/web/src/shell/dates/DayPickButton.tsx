import { useEffect, useRef, useState } from 'react'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { PLACE_ICON } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { DayGrid, monthOf } from './grids'

/**
 * A calendar button that opens the shared month grid and gives the day pointed at (FR-034): for a
 * row that offers a few named days and "another day" (Today's Overdue).
 */
export function DayPickButton({
  label,
  today,
  onPick,
}: {
  label: string
  today: string
  onPick: (day: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(monthOf(today))
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div
      ref={box}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          e.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        aria-expanded={open}
        className={`${ICON_BUTTON} size-6.5`}
      >
        <PLACE_ICON.calendar size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`absolute top-full right-0 ${LAYER.menu} mt-1.5 w-80 rounded-block bg-float p-2 shadow-float`}
        >
          <DayGrid
            month={month}
            setMonth={setMonth}
            value={null}
            today={today}
            onPick={(day) => {
              setOpen(false)
              onPick(day)
            }}
          />
        </div>
      )}
    </div>
  )
}
