import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Where a step of a page's path links. */
type Step = { label: string; to: string }

/** A page's canonical path: steps that link, then the page itself, which does not. */
export type Crumbs = readonly [] | readonly [...Step[], { label: string }]

const SetCrumbs = createContext<((crumbs: Crumbs) => void) | null>(null)
const CrumbsContext = createContext<Crumbs>([])

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumbs>([])
  return (
    <SetCrumbs.Provider value={setCrumbs}>
      <CrumbsContext.Provider value={crumbs}>{children}</CrumbsContext.Provider>
    </SetCrumbs.Provider>
  )
}

/**
 * A page says where it is and the header draws it: its place in the hierarchy, not the way it was
 * reached.
 */
export function useCrumbs(crumbs: Crumbs): void {
  const set = useContext(SetCrumbs)
  // By value: callers build the array inline, and a new array each render must not loop.
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    set?.(JSON.parse(key) as Crumbs)
    return () => set?.([])
  }, [set, key])
}

export function Breadcrumbs() {
  const crumbs = useContext(CrumbsContext)
  const here = crumbs.at(-1)
  if (!here) return null
  const trail = crumbs.slice(0, -1) as readonly Step[]
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
