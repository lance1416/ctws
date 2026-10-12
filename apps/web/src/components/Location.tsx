import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** One step of a page's canonical path. The last step is the page itself and has no link. */
export type Crumb = { label: string; to?: string }

const SetCrumbs = createContext<((crumbs: readonly Crumb[]) => void) | null>(null)
const Crumbs = createContext<readonly Crumb[]>([])

export function LocationProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<readonly Crumb[]>([])
  return (
    <SetCrumbs.Provider value={setCrumbs}>
      <Crumbs.Provider value={crumbs}>{children}</Crumbs.Provider>
    </SetCrumbs.Provider>
  )
}

/**
 * A page says where it is; the header draws it.
 *
 * HIERARCHY, NOT HISTORY (NN/g on breadcrumbs): a kind's page sits under Things, a project page
 * under Projects, and a page reached two ways still shows one path. The rail only marks the tier
 * a page belongs to, so on a kind's page this is the one place that names the page itself.
 *
 * `null` leaves the location alone: a page that is also drawn INSIDE another (Done, as a tab of
 * Review) must not clear its host's path when it comes and goes.
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

export function Location() {
  const crumbs = useContext(Crumbs)
  if (crumbs.length === 0) return null
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-2 text-fg-muted">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        return (
          <span key={i} className={`flex items-center gap-2 ${last ? 'min-w-0' : 'shrink-0'}`}>
            {i > 0 && (
              <span aria-hidden="true" className="text-fg-subtle">
                /
              </span>
            )}
            {last || !c.to ? (
              // The page itself: named, never a link to where you already are.
              <span
                aria-current={last ? 'page' : undefined}
                className="truncate font-semibold text-fg"
              >
                {c.label}
              </span>
            ) : (
              <Link to={c.to} className="hover:text-fg">
                {c.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
