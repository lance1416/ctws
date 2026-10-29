import { LAYER } from '../../platform/ui/layers'
import type { City } from '@ctws/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useComposing } from '../../platform/keyboard/composition'
import { citiesQuery } from './api'
import { field } from '../../platform/ui/formStyles'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'

/**
 * A city, saved in the canonical spelling picked from the server's list; a name it does not know
 * is still saved as written. The list is drawn here because Windows draws a native `<datalist>`
 * itself, ignoring the theme.
 */
export function PickCity({
  label,
  id,
  value,
  onChange,
  onPick,
}: {
  label: string
  id: string
  value: string
  onChange: (next: string) => void
  /** The city chosen from the list, with its key and zone; null once the words are typed over. */
  onPick?: (city: City | null) => void
}) {
  const [typing, setTyping] = useState(false)
  const [at, setAt] = useState(0)
  const composing = useComposing()
  const listId = useId()

  const asked = useDebouncedValue(value.trim())
  const searching = typing && asked.length >= 3
  // While the words change, the last list stays up rather than blinking away.
  const hits = useQuery({
    ...citiesQuery(asked),
    enabled: searching,
    placeholderData: keepPreviousData,
  })

  const cities = searching ? (hits.data ?? []) : []
  const exact = cities.some((c) => c.label === value)
  const listed = cities.length > 0 && !exact
  const unknown = searching && hits.isSuccess && !hits.isPlaceholderData && cities.length === 0
  const active = Math.min(at, Math.max(cities.length - 1, 0))
  const choose = (c: City) => {
    onChange(c.label)
    onPick?.(c)
    setTyping(false)
  }

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-meta text-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={listed}
        aria-controls={listId}
        aria-activedescendant={listed ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setTyping(true)
          setAt(0)
          onChange(e.target.value)
          onPick?.(null)
        }}
        {...composing.bind}
        onKeyDown={(e) => {
          if (composing.composingNow(e) || !listed) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setAt((active + 1) % cities.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setAt((active - 1 + cities.length) % cities.length)
          } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
            // The list's Enter, never the form's (BUG-082).
            e.preventDefault()
            const city = cities[active]
            if (city) choose(city)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setTyping(false)
          }
        }}
        onBlur={() => {
          // A click on the list lands after this blur, so the list closes a beat later.
          window.setTimeout(() => setTyping(false), 120)
        }}
        className={`${field} text-ui`}
      />

      {listed && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label}: matches`}
          className={`absolute ${LAYER.menu} mt-1 max-h-56 w-full overflow-y-auto rounded-block bg-float py-1 shadow-float`}
        >
          {cities.map((c: City, i) => (
            <li
              key={c.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // `onMouseDown`: a click comes after the blur, when the list is already closing.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(c)
              }}
              onMouseEnter={() => setAt(i)}
              className={`cursor-pointer truncate px-3 py-1.5 text-ui text-ink ${
                i === active ? 'bg-select' : ''
              }`}
            >
              {c.label}
            </li>
          ))}
        </ul>
      )}

      {unknown && (
        <p className="mt-1 text-meta text-muted">
          No city by that name. It will be saved as written.
        </p>
      )}
    </div>
  )
}
