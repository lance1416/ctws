import { useRegistry } from '../registry'
import { ProjectsSidebar } from '../projects/ProjectsSidebar'
import type { Place } from './places'

/**
 * THE MODULE SIDEBAR (FR-020): the module's list, always there, so opening a thing never loses
 * it. Its head names the module, says how many, and holds the module's New. About 250 wide;
 * `[` hides it and the choice is remembered.
 *
 * Each module's list arrives with that module's batch (FR-020 lists them); until then the head
 * stands alone. Projects, which the shell owns, is here already.
 */
export function Sidebar({ place }: { place: Place }) {
  const registry = useRegistry()
  if (place.id === 'projects') return <ProjectsSidebar />
  const Count = registry.kinds.find((k) => k.label === place.label)?.Count
  return (
    <aside
      aria-label={place.label}
      className="flex w-sidebar shrink-0 flex-col border-r border-line bg-chrome"
    >
      <SidebarHead label={place.label}>{Count && <Count />}</SidebarHead>
    </aside>
  )
}

/** The head every sidebar shares: the name, the count beside it, then the module's own controls. */
export function SidebarHead({
  label,
  action,
  children,
}: {
  label: string
  /** The New button, at the end. */
  action?: React.ReactNode
  /** The count, in the module's words. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-3.5">
      <h2 className="text-ui font-medium text-ink">{label}</h2>
      <span className="flex-1 text-meta text-subtle tabular-nums">{children}</span>
      {action}
    </div>
  )
}
