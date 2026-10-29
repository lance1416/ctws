import { radioKeys, tabKeys } from './choiceKeys'
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
 * on one grey track, the current one raised on the panel. Tabs to a screen reader, as it is,
 * each naming what it shows (`controls`); one Tab stop, the arrows switching (DES-001 section 4).
 */
export function Segmented({
  label,
  segments,
  current,
  onPick,
  picks = false,
  controls,
}: {
  label: string
  segments: readonly Segment[]
  current: string
  onPick: (id: string) => void
  /**
   * It picks a setting that is kept (a theme), not a view of what is under it: a radiogroup, one
   * Tab stop, the arrows picking as they move (DES-001 section 4).
   */
  picks?: boolean
  /** The id of what the tabs switch, for a switch of views. */
  controls?: string
}) {
  return (
    <span
      role={picks ? 'radiogroup' : 'tablist'}
      aria-label={label}
      onKeyDown={picks ? radioKeys : tabKeys}
      className="inline-flex rounded-card bg-hover p-0.5"
    >
      {segments.map(({ id, label: name, icon: Icon, unavailable }) => (
        <button
          key={id}
          type="button"
          role={picks ? 'radio' : 'tab'}
          {...(picks
            ? { 'aria-checked': id === current, tabIndex: id === current ? 0 : -1 }
            : {
                'aria-selected': id === current,
                tabIndex: id === current ? 0 : -1,
                ...(controls ? { 'aria-controls': controls } : {}),
              })}
          // Not `disabled`: a disabled button never hears the hover that would say why.
          aria-disabled={unavailable ? true : undefined}
          title={typeof unavailable === 'string' ? unavailable : undefined}
          onClick={() => {
            if (!unavailable) onPick(id)
          }}
          className={`inline-flex h-6.5 max-lg:h-11 items-center gap-1.5 rounded-control px-2.25 text-meta font-medium ${
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
