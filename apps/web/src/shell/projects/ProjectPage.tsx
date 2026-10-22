import { idFrom, projectId, type ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { useParams } from 'react-router-dom'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { DangerZone } from '../../platform/ui/DangerZone'
import { RowsPanel } from '../../platform/ui/Panel'
import { useViewParam } from '../../platform/ui/ViewTabs'
import { DeletedNotice } from '../detail/DeletedNotice'
import type { Crumbs } from '../layout/page'
import { useSubjectOf } from '../layout/subject'
import { LinkBlocks } from '../links/LinkBlocks'
import { useRegistry } from '../registry'
import { pinnedOf, resourcesQuery } from '../resources/api'
import { useForgetWhenGone, useRecordRecent } from '../search/recent'
import { useEveryProject } from './api'
import { DeleteProject } from './DeleteProject'
import { digitHandlers, PROJECT_KEYS } from './keys'
import { ProjectHead } from './ProjectHead'

/** The project the address names, live or archived: an archived project still has its page. */
function useOpenProject() {
  const { id: idParam } = useParams()
  const id = idParam === undefined ? undefined : idFrom(projectId, idParam)
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)
  return { id, project, gone: projects.isSuccess && !project }
}

/** The project page's path: its name once known, or that there is no such project. */
export function useProjectCrumbs(): Crumbs {
  const { project, gone } = useOpenProject()
  const name = project?.name ?? (gone ? 'Not found' : null)
  return name ? [{ label: 'Projects', to: '/projects' }, { label: name }] : []
}

/**
 * A project's page (artboard 8): its head, the rows it is about in the view picked there,
 * everything linked to it, and delete at the foot. A project is worked in, so it has a page;
 * other records open as a pane over their list.
 */
export function ProjectPage() {
  const { id, project, gone } = useOpenProject()
  useForgetWhenGone('project', id ?? null, gone)
  useSubjectOf(id && project ? { type: 'project', id, title: project.name } : null)
  useRecordRecent(
    id && project
      ? { type: 'project', id, title: project.name, to: `/projects/${id}`, kind: 'Project' }
      : null,
  )

  if (!id) return null
  // An old address to a deleted project: the main area is what happened to it.
  if (gone) return <DeletedNotice type="project" id={id} />
  // Keyed by the project: what was half-done on one (a rename, a delete question) does not carry
  // over to the next, which the router draws in the same element.
  return <OpenProject key={id} id={id} />
}

function OpenProject({ id }: { id: ProjectId }) {
  const registry = useRegistry()
  const main = registry.projectMain
  const [view, pickView] = useViewParam(main?.views ?? [])
  const pinned = pinnedOf(useQuery(resourcesQuery({ type: 'project', id })).data ?? [])
  const views = main?.views ?? []
  useDocumentKeys(PROJECT_KEYS, {
    switchView: () => {
      const at = views.findIndex((v) => v.id === view)
      const next = views[(at + 1) % views.length]
      if (next) pickView(next.id)
    },
    ...digitHandlers((digit) => {
      const r = pinned.find((p) => p.pinnedRank === digit)
      if (r) window.open(r.url, '_blank', 'noopener,noreferrer')
    }),
  })
  // Linked lists the kinds the page's own rows do not already show.
  const linkedKinds = registry.relations
    .filter((r) => r.moduleId === null || r.moduleId !== main?.moduleId)
    .map((r) => r.type)

  return (
    <Fragment>
      <section aria-label="Project at a glance" className="mb-4 min-w-0">
        <ProjectHead id={id} views={views} view={view} onView={pickView} />
      </section>

      {/* Linked sits beside the rows only when this column is wide enough (a container query,
          so an open detail pane counts); otherwise it goes under them. */}
      <div className="@container">
        <div className="grid min-w-0 grid-cols-1 items-start gap-10 @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-14">
          <div className="flex min-w-0 flex-col gap-4">
            {main && (
              <RowsPanel label={main.moduleLabel}>
                <main.Component projectId={id} view={view} />
              </RowsPanel>
            )}
          </div>
          <section aria-label="Linked" data-panel="Linked" className="min-w-0 @5xl:pt-1">
            <LinkBlocks of={{ type: 'project', id }} types={linkedKinds} />
          </section>
        </div>
      </div>

      <DangerZone>
        <DeleteProject id={id} />
      </DangerZone>
    </Fragment>
  )
}
