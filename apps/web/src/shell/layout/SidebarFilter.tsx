import { CloseIcon, PLACE_ICON } from '../../platform/ui/icons'

/** A sidebar long enough to need it gets the box (FR-015 "多"): past this many rows. */
export const FILTER_FROM = 8

/** Whether a name holds what was typed, as the sidebar filters: case and spaces aside. */
export const matches = (name: string, typed: string) =>
  name.toLocaleLowerCase().includes(typed.trim().toLocaleLowerCase())

/**
 * THE BOX AT THE TOP OF A LONG SIDEBAR (FR-015, U-11, U-16): what is typed narrows the list to the
 * names that hold it; × or Esc empties it.
 */
export function SidebarFilter({
  what,
  value,
  onChange,
}: {
  /** The list's kind, for the box's name: "projects". */
  what: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label
      data-field
      className="mx-1.5 mb-1.5 flex h-7.5 shrink-0 items-center gap-2 rounded-control border border-line bg-panel px-2 text-subtle"
    >
      <PLACE_ICON.search size={14} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            onChange('')
          }
        }}
        placeholder="Filter"
        aria-label={`Filter ${what}`}
        className="min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear the filter"
          className="inline-grid size-5 place-items-center rounded-control text-muted hover:bg-hover"
        >
          <CloseIcon size={12} aria-hidden="true" />
        </button>
      )}
    </label>
  )
}

/** The list filtered to nothing: what was typed, and the way back (FR-030 "筛空"). */
export function FilteredEmpty({ typed, onClear }: { typed: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-1 px-3.5 py-2 text-ui">
      <p className="text-muted">Nothing matches “{typed.trim()}”.</p>
      <button type="button" onClick={onClear} className="text-meta text-ink hover:underline">
        Clear the filter
      </button>
    </div>
  )
}
