import { useId } from 'react'
import { useComposing } from '../keyboard/composition'
import { boxed } from './formStyles'
import { LAYER } from './layers'

/** Every zone the browser knows, for one typed by hand. */
const ZONES = Intl.supportedValuesOf('timeZone')

/** The zones whose names hold the words typed, a space read as `_`. */
const zonesMatching = (words: string) => {
  const asked = words.trim().toLowerCase().replace(/ /g, '_')
  return asked ? ZONES.filter((z) => z.toLowerCase().includes(asked)) : []
}

/**
 * What typed words choose: null (from the city) when there are none, the zone they name, else the
 * first they match; undefined when they match none, which changes nothing.
 */
export function zoneFrom(words: string): string | null | undefined {
  const asked = words.trim().toLowerCase().replace(/ /g, '_')
  if (!asked) return null
  return ZONES.find((z) => z.toLowerCase() === asked) ?? zonesMatching(words)[0]
}

/**
 * A zone typed and picked from the browser's list, the names in mono as zones are written: a
 * person's Lives in (FR-063) and the account's own zone (artboard 30). Esc backs out.
 */
export function ZoneBox({
  zone,
  typed,
  onType,
  onZone,
  onLeave,
  onCancel,
  placeholder,
}: {
  zone: string | null
  placeholder: string
  /** Esc: leave the zone as it was. */
  onCancel?: () => void
  typed: string
  onType: (words: string) => void
  onZone: (zone: string | null) => void
  onLeave: () => void
}) {
  const composing = useComposing()
  const listId = useId()
  const found = zonesMatching(typed).slice(0, 12)
  return (
    <div className="relative min-w-0">
      <input
        aria-label="Time zone"
        role="combobox"
        aria-expanded={found.length > 0}
        aria-controls={listId}
        autoComplete="off"
        autoFocus
        placeholder={placeholder}
        value={typed}
        onChange={(e) => onType(e.target.value)}
        onBlur={onLeave}
        {...composing.bind}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault()
            onCancel()
            return
          }
          if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || composing.composingNow(e)) return
          e.preventDefault()
          onLeave()
        }}
        className={`${boxed} w-full font-mono`}
      />
      {found.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute ${LAYER.menu} mt-1 max-h-56 w-full overflow-y-auto rounded-block bg-float py-1 shadow-float`}
        >
          {found.map((z) => (
            <li key={z} role="option" aria-selected={z === zone}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onZone(z)
                }}
                className="block w-full truncate px-3 py-1.5 text-left font-mono text-ui text-ink hover:bg-hover"
              >
                {z}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
