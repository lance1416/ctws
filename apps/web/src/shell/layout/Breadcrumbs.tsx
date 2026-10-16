import { Link } from 'react-router-dom'
import { usePage, type Crumbs } from './page'

/** The matched page's path, which its route's handle says. */
export function Breadcrumbs() {
  const page = usePage('useCrumbs')
  // Keyed by the route, so the page's hook is always the same one in a mounted trail.
  return page ? <Trail key={page.id} useCrumbs={page.value} /> : null
}

function Trail({ useCrumbs }: { useCrumbs: () => Crumbs }) {
  const crumbs = useCrumbs()
  const here = crumbs.at(-1)
  if (!here) return null
  const trail = crumbs.slice(0, -1) as readonly { label: string; to: string }[]
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-2 text-ink-muted">
      {/* Below 640 only the page's own name fits. */}
      {trail.map((c, i) => (
        <span key={i} className="flex shrink-0 items-center gap-2 max-sm:hidden">
          {i > 0 && <Slash />}
          <Link to={c.to} className="hover:text-ink">
            {c.label}
          </Link>
        </span>
      ))}
      <span className="flex min-w-0 items-center gap-2">
        {trail.length > 0 && <Slash />}
        <span aria-current="page" className="truncate font-semibold text-ink">
          {here.label}
        </span>
      </span>
    </nav>
  )
}

function Slash() {
  return (
    <span aria-hidden="true" className="text-ink-subtle max-sm:hidden">
      /
    </span>
  )
}
