import type { City } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { citiesQuery } from './api'
import { field } from '../../platform/ui/formStyles'

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
}: {
  label: string
  id: string
  value: string
  onChange: (next: string) => void
}) {
  const [typing, setTyping] = useState(false)
  const listId = useId()

  const hits = useQuery({
    ...citiesQuery(value),
    enabled: typing && value.trim().length >= 3,
  })

  const cities = hits.data ?? []
  const exact = cities.some((c) => c.label === value)
  const listed = typing && cities.length > 0 && !exact
  const unknown = typing && value.trim().length >= 3 && hits.isSuccess && cities.length === 0

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={listed}
        aria-controls={listId}
        onChange={(e) => {
          setTyping(true)
          onChange(e.target.value)
        }}
        onBlur={() => {
          // A click on the list lands after this blur, so the list closes a beat later.
          window.setTimeout(() => setTyping(false), 120)
        }}
        className={`${field} text-sm`}
      />

      {listed && (
        <ul
          id={listId}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] bg-float py-1 shadow-float"
        >
          {cities.map((c: City) => (
            <li key={c.label}>
              <button
                type="button"
                // `onMouseDown`: a click comes after the blur, when the list is already closing.
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(c.label)
                  setTyping(false)
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:bg-hover"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {unknown && (
        <p className="mt-1 text-xs text-ink-muted">
          No city by that name. It will be saved as written.
        </p>
      )}
    </div>
  )
}
