import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** One step of a page's canonical path. The last step is the page itself and has no link. */
export type Crumb = { label: string; to?: string }

const SetCrumbs = createContext<((crumbs: readonly Crumb[]) => void) | null>(null)
const Crumbs = createContext<readonly Crumb[]>([])

export function BreadcrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<readonly Crumb[]>([])
  return (
    <SetCrumbs.Provider value={setCrumbs}>
      <Crumbs.Provider value={crumbs}>{children}</Crumbs.Provider>
    </SetCrumbs.Provider>
  )
}

/**
 * A page says where it is and the header draws it: its place in the hierarchy, not the way it was
 * reached. `null` leaves the path alone, for a page drawn inside another (Done, as a tab of Review).
 */
export function useCrumbs(crumbs: readonly Crumb[] | null): void {
  const set = useContext(SetCrumbs)
  // By value: callers build the array inline, and a new array each render must not loop.
  const key = crumbs ? JSON.stringify(crumbs) : null
  useEffect(() => {
    if (key === null) return
    set?.(JSON.parse(key) as Crumb[])
    return () => set?.([])
  }, [set, key])
}

export function Breadcrumbs() {
  const crumbs = useContext(Crumbs)
  if (crumbs.length === 0) return null
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-2 text-ink-muted">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          // Below 640 only the page's own name fits.
          <span
            key={i}
            className={`flex items-center gap-2 ${last ? 'min-w-0' : 'shrink-0 max-sm:hidden'}`}
          >
            {i > 0 && (
              <span aria-hidden="true" className="text-ink-subtle max-sm:hidden">
                /
              </span>
            )}
            {last || !c.to ? (
              <span
                aria-current={last ? 'page' : undefined}
                className="truncate font-semibold text-ink"
              >
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="hover:text-ink">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
