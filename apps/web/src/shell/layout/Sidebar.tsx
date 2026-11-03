import { useContext } from 'react'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { NewIcon } from '../../platform/ui/icons'
import { NewContext } from '../creates'
import { useRegistry } from '../registry'
import { ProjectsSidebar } from '../projects/ProjectsSidebar'
import type { Place } from './places'

/**
 * The module's list, always there, so opening a thing never loses it. `[` hides it and the choice
 * is remembered.
 */
export function Sidebar({ place }: { place: Place }) {
  const registry = useRegistry()
  const openNew = useContext(NewContext)
  if (place.id === 'projects') return <ProjectsSidebar />
  const own = registry.pageSidebars[place.to]
  if (own)
    return (
      <aside
        aria-label={own.label}
        className="flex w-sidebar shrink-0 flex-col border-r border-line bg-chrome"
      >
        <SidebarHead label={own.label} />
        <own.List />
      </aside>
    )
  const kind = registry.kinds.find((k) => k.label === place.label)
  const Count = kind?.Count
  const List = kind?.List
  const creator = registry.creates.find((c) => c.kind === place.kind)
  return (
    <aside
      aria-label={place.label}
      className="flex w-sidebar shrink-0 flex-col border-r border-line bg-chrome"
    >
      <SidebarHead
        label={place.label}
        action={
          creator && (
            <button
              type="button"
              onClick={() => openNew(creator, { opens: true })}
              aria-label={`New ${creator.label.toLocaleLowerCase()}`}
              title={`New ${creator.label.toLocaleLowerCase()}  N ${creator.key.toUpperCase()}`}
              className={ICON_BUTTON}
            >
              <NewIcon size={16} aria-hidden="true" />
            </button>
          )
        }
      >
        {Count && <Count />}
      </SidebarHead>
      {List && <List />}
    </aside>
  )
}

/**
 * The head every sidebar shares: the name, then how many there are, a bare
 * number beside the module's New at the right end.
 */
export function SidebarHead({
  label,
  action,
  children,
}: {
  label: string
  /** The New button, at the end. */
  action?: React.ReactNode
  /** How many there are, as a number. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 pr-2 pl-3.5">
      <h2 className="flex-1 truncate text-ui font-medium text-ink">{label}</h2>
      <span data-sidebar-count className="text-meta text-muted tabular-nums">
        {children}
      </span>
      {action}
    </div>
  )
}
