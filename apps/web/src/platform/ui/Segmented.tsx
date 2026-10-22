import type { IconComponent } from './icons'

type Segment = {
  id: string
  label: string
  icon?: IconComponent
  /** It cannot be picked now, and why, said on hover when there is a why; it stays, greyed. */
  unavailable?: string | true
}

/**
 * A SEGMENTED SWITCH between a few views of one thing (artboard 8: Tree and Board): the views sit
 * on one grey track, the current one raised on the panel. Tabs to a screen reader, as it is.
 */
export function Segmented({
  label,
  segments,
  current,
  onPick,
}: {
  label: string
  segments: readonly Segment[]
  current: string
  onPick: (id: string) => void
}) {
  return (
    <span role="tablist" aria-label={label} className="inline-flex rounded-card bg-hover p-0.5">
      {segments.map(({ id, label: name, icon: Icon, unavailable }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={id === current}
          // Not `disabled`: a disabled button never hears the hover that would say why.
          aria-disabled={unavailable ? true : undefined}
          title={typeof unavailable === 'string' ? unavailable : undefined}
          onClick={() => {
            if (!unavailable) onPick(id)
          }}
          className={`inline-flex h-6.5 items-center gap-1.5 rounded-control px-2.25 text-meta font-medium ${
            id === current
              ? 'bg-panel text-ink ring-1 ring-line'
              : unavailable
                ? 'cursor-default text-subtle opacity-55'
                : 'text-muted hover:text-ink'
          }`}
        >
          {Icon && <Icon size={14} aria-hidden="true" />}
          {name}
        </button>
      ))}
    </span>
  )
}
