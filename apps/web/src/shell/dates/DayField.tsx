import { parseDay, parseMonth } from '@ctws/core'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { boxed } from '../../platform/ui/formStyles'
import { CloseIcon, PLACE_ICON } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { MONTHS } from '../../platform/time/dates'
import { DayGrid, MonthGrid, monthOf } from './grids'

/** How a chosen day reads once the field is left: "Oct 29", with the year when it is not this one. */
function sayDay(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const word = `${MONTHS[m - 1]} ${d}`
  return y === Number(today.slice(0, 4)) ? word : `${word}, ${y}`
}

/** "Mar 2023". */
function sayMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return `${MONTHS[m - 1]} ${y}`
}

/**
 * THE ONE DATE FIELD (FR-034): type a day any way ("Oct 29", "29/10", "tomorrow", "fri") and it
 * is read when the field is left, or open the grid and point. `month` mode takes a year and month
 * only, for a role's start and end. A typed value that is not a date stays in the box and says so.
 */
export function DayField({
  value,
  onChange,
  today,
  label,
  id,
  mode = 'day',
  placeholder,
  accent,
  className = '',
  clearable = true,
}: {
  value: string | null
  onChange: (next: string | null) => void
  today: string
  /** The field's name for assistive technology, and the grid's. */
  label: string
  id?: string
  mode?: 'day' | 'month'
  placeholder?: string
  /** The fill of the chosen day in the grid. */
  accent?: string
  className?: string
  clearable?: boolean
}) {
  const say = (v: string | null) =>
    v === null ? '' : mode === 'month' ? sayMonth(v) : sayDay(v, today)
  const [text, setText] = useState(() => say(value))
  const [refused, setRefused] = useState(false)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(() => (value ?? today).slice(0, mode === 'month' ? 4 : 7))
  const box = useRef<HTMLDivElement>(null)

  // A value changed from outside (a named-day button, a reset) is said again.
  useEffect(() => {
    setText(say(value))
    setRefused(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `say` is derived from props already listed.
  }, [value, today, mode])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const read = () => {
    const typed = text.trim()
    if (typed === '') {
      setRefused(false)
      if (value !== null) onChange(null)
      return
    }
    const parsed = mode === 'month' ? parseMonth(typed, today) : parseDay(typed, today)
    if (parsed === null) {
      setRefused(true)
      return
    }
    setRefused(false)
    setText(say(parsed))
    if (parsed !== value) onChange(parsed)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      read()
      setOpen(false)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
    }
  }
  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className={`flex items-center gap-1 pr-1 ${boxed} ${refused ? 'border-stop' : ''}`}>
        <input
          id={id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={read}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (value) setShown(value.slice(0, mode === 'month' ? 4 : 7))
          }}
          aria-label={label}
          aria-invalid={refused || undefined}
          placeholder={placeholder ?? (mode === 'month' ? 'Mar 2023' : 'Oct 29, tomorrow, fri')}
          className="min-w-0 flex-1 bg-transparent placeholder:text-subtle focus-visible:outline-none"
        />
        {clearable && value !== null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Clear ${label.toLocaleLowerCase()}`}
            className={`${ICON_BUTTON} size-6`}
          >
            <CloseIcon size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close the calendar' : 'Open the calendar'}
          aria-expanded={open}
          className={`${ICON_BUTTON} size-6`}
        >
          <PLACE_ICON.calendar size={14} aria-hidden="true" />
        </button>
      </div>
      {refused && (
        <p role="alert" className="mt-1 text-meta text-stop-t">
          “{text.trim()}” is not a day I know. Try Oct 29, 29/10, tomorrow or fri.
        </p>
      )}
      {open && (
        <div
          className={`absolute top-full left-0 ${LAYER.menu} mt-1.5 w-80 rounded-block bg-float p-2 shadow-float`}
        >
          {mode === 'month' ? (
            <MonthGrid
              year={Number(shown.slice(0, 4))}
              setYear={(y) => setShown(String(y))}
              value={value}
              today={today}
              onPick={pick}
              {...(accent ? { accent } : {})}
            />
          ) : (
            <DayGrid
              month={shown.length === 7 ? shown : monthOf(today)}
              setMonth={setShown}
              value={value}
              today={today}
              onPick={pick}
              {...(accent ? { accent } : {})}
            />
          )}
        </div>
      )}
    </div>
  )
}
