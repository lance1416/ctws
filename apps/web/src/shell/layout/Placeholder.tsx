import { KIND_ICON } from '../../platform/ui/icons'
import { KIND_TEXT, KIND_TINT, type Place } from './places'

/** A module that has its place on the bar before its pages exist (EPIC-12): its badge and name. */
export function Placeholder({ place }: { place: Place }) {
  const kind = place.kind!
  const Icon = KIND_ICON[kind]
  return (
    <div className="flex flex-col items-start gap-3">
      <span className={`inline-grid size-9 place-items-center rounded-control ${KIND_TINT[kind]}`}>
        <Icon size={20} aria-hidden="true" className={KIND_TEXT[kind]} />
      </span>
      <h1 className="text-title text-ink">{place.label}</h1>
      <p className="text-ui text-muted">Coming later.</p>
    </div>
  )
}
