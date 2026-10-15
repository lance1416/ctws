/** The tabs in a block's head, and in the calendar's. */
export function ViewTabs({
  views,
  current,
  onPick,
}: {
  views: readonly { id: string; label: string }[]
  current: string
  onPick: (id: string) => void
}) {
  if (views.length < 2) return null
  return (
    <span role="tablist" className="flex items-center gap-0.5">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={v.id === current}
          onClick={() => onPick(v.id)}
          className={`h-8 rounded-md px-2.5 text-sm ${
            v.id === current ? 'bg-select text-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'
          }`}
        >
          {v.label}
        </button>
      ))}
    </span>
  )
}
