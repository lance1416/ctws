import { Link, useLocation } from 'react-router-dom'
import { CollapseIcon } from '../../platform/ui/icons'
import { usePage, type Crumbs } from './page'
import { placeOf, type Place } from './places'
import { KIND_TEXT } from '../../platform/ui/kinds'

/**
 * Where you are (FR-018): the module, with its icon and name, then the thing that is open. The
 * module comes from the address; the thing from what the page's route says of itself.
 */
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const place = placeOf(pathname)
  const page = usePage('useCrumbs')
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-1.5 text-ui text-muted">
      {place && (
        <Link to={place.to} className="flex shrink-0 items-center gap-1.5 hover:text-ink">
          <place.icon
            size={14}
            aria-hidden="true"
            className={place.kind ? KIND_TEXT[place.kind] : ''}
          />
          <span>{place.label}</span>
        </Link>
      )}
      {/* Keyed by the route, so the page's hook is always the same one in a mounted trail. */}
      {page && <Here key={page.id} place={place} useCrumbs={page.value} />}
    </nav>
  )
}

function Here({ place, useCrumbs }: { place: Place | null; useCrumbs: () => Crumbs }) {
  const crumbs = useCrumbs()
  const here = crumbs.at(-1)
  if (!here || here.label === place?.label) return null
  // A page outside the icon bar's places names the way to it itself: Account, then the report.
  const steps = place
    ? []
    : crumbs.slice(0, -1).flatMap((c) => ('to' in c ? [c as { label: string; to: string }] : []))
  return (
    <>
      {steps.map((step, i) => (
        <span key={step.to} className="flex shrink-0 items-center gap-1.5">
          {i > 0 && <CollapseIcon size={12} aria-hidden="true" className="shrink-0 text-subtle" />}
          <Link to={step.to} className="hover:text-ink">
            {step.label}
          </Link>
        </span>
      ))}
      {(place || steps.length > 0) && (
        <CollapseIcon size={12} aria-hidden="true" className="shrink-0 text-subtle" />
      )}
      <span aria-current="page" className="truncate font-medium text-ink">
        {here.label}
      </span>
    </>
  )
}
