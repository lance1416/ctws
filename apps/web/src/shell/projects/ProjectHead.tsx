import type { ProjectId } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { MoreIcon, type IconComponent } from '../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'
import { Segmented } from '../../platform/ui/Segmented'
import { NewMenu } from '../creates'
import { projectKeys, updateProject, useEveryProject } from './api'
import { PinnedResources } from './PinnedResources'
import { ProjectSquare } from './ProjectSquare'

type View = { id: string; label: string; icon?: IconComponent }

/**
 * THE HEAD OF A PROJECT'S PAGE (FR-053, artboard 8): its square and name, the switch between its
 * views, New and More; under them, the resources it pins.
 */
export function ProjectHead({
  id,
  views,
  view,
  onView,
}: {
  id: ProjectId
  views: readonly View[]
  view: string
  onView: (id: string) => void
}) {
  // Live or archived: an archived project still has its page, marked as such.
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)
  if (!project) {
    return projects.isSuccess ? (
      <p className="text-ui text-muted">This project is not here any more.</p>
    ) : null
  }
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      {/* On a narrow screen the name has a line of its own, and the controls wrap under it. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {/* Its name and colour are changed on its edit page, not here (DES-001 v1.23). */}
        <div className="flex min-w-0 flex-1 items-center gap-3 max-md:basis-full">
          <ProjectSquare project={project} size={34} />
          <h1
            id="project-heading"
            tabIndex={-1}
            className="min-w-0 flex-1 truncate text-title tracking-normal text-ink focus:outline-none"
          >
            {project.name}
          </h1>
        </div>
        {project.archivedAt && (
          <span
            data-project-archived
            className="inline-flex h-5.5 shrink-0 items-center rounded-control bg-hover px-2 text-meta font-medium text-muted"
          >
            Archived
          </span>
        )}
        {/* The inbox is a list to empty, never a board (FR-059). */}
        {views.length > 1 && !project.isInbox && (
          <Segmented label="View" segments={views} current={view} onPick={onView} />
        )}
        <NewMenu projectName={project.name} className="shrink-0" />
        {/* The inbox is where capture lands, and the server refuses to archive it. */}
        {/* The inbox is edited too (its name), but never archived: capture lands there. */}
        <MoreMenu id={id} archived={project.isInbox ? null : project.archivedAt !== null} />
      </div>
      <PinnedResources projectId={id} />
    </div>
  )
}

/**
 * What else can be done to the project (FR-052): edit its name, colour and initials, where delete
 * is too; archive, which hides it from the rail and the live lists but keeps everything, and is
 * undone from the same menu.
 */
/** `archived` null: the inbox, which is never archived. */
function MoreMenu({ id, archived }: { id: ProjectId; archived: boolean | null }) {
  const navigate = useNavigate()
  const toggle = useMutation({
    mutationFn: () => updateProject(id, { archived: !archived }),
    meta: { changes: ['project'], awaits: [projectKeys.all], ownsError: true },
  })
  return (
    <div className="relative flex shrink-0 flex-col items-end">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label="More" className={ICON_BUTTON}>
          <MoreIcon size={16} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
            <DropdownMenu.Item
              onSelect={() => navigate(`/projects/${id}/edit`)}
              className={MENU_ITEM}
            >
              Edit project
            </DropdownMenu.Item>
            {archived !== null && (
              <DropdownMenu.Item
                onSelect={() => toggle.mutate()}
                disabled={toggle.isPending}
                className={MENU_ITEM}
              >
                {archived ? 'Unarchive' : 'Archive'}
              </DropdownMenu.Item>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {toggle.isError && (
        <p
          role="alert"
          className="absolute top-full right-0 mt-1 text-ui whitespace-nowrap text-stop-t"
        >
          {archived ? 'Couldn’t unarchive.' : 'Couldn’t archive.'} Try again.
        </p>
      )}
    </div>
  )
}
