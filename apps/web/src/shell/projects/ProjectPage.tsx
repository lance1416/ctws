import { idFrom, projectId, type ProjectId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { splitColumns, useColumns } from '../../platform/ui/columns'
import { useViewParam } from '../../platform/ui/ViewTabs'
import { DeletedNotice } from '../detail/DeletedNotice'
import type { Crumbs } from '../layout/page'
import { useSubjectOf } from '../layout/subject'
import { useRegistry } from '../registry'
import { followable, pinnedOf, resourceName, resourcesQuery } from '../resources/api'
import { useGoOut } from '../resources/away'
import { useForgetWhenGone, useRecordRecent } from '../search/recent'
import { useEveryProject } from './api'
import { digitHandlers, PROJECT_KEYS } from './keys'
import { PROJECT_MAIN, ProjectHead } from './ProjectHead'
import { ProjectLinked } from './ProjectLinked'

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
 * A project's page (artboard 8): its head, the rows it is about in the view picked there, and
 * everything linked to it; delete is on its edit page (FR-052). A project is worked in, so it has a page;
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
  const [asked, pickView] = useViewParam(main?.views ?? [])
  // The inbox is a list to empty: its tree, whatever the address asks (FR-059).
  const project = useEveryProject().data?.find((p) => p.id === id)
  const inbox = project?.isInbox === true
  const goOut = useGoOut()
  const view = inbox ? (main?.views[0].id ?? asked) : asked
  const pinned = pinnedOf(useQuery(resourcesQuery({ type: 'project', id })).data ?? [])
  const views = main?.views ?? []
  useDocumentKeys(PROJECT_KEYS, {
    switchView: () => {
      if (inbox) return
      const at = views.findIndex((v) => v.id === view)
      const next = views[(at + 1) % views.length]
      if (next) pickView(next.id)
    },
    ...digitHandlers((digit) => {
      const r = pinned.find((p) => p.pinnedRank === digit)
      const url = followable(r?.url ?? '')
      if (!r || !url) return
      goOut({
        url,
        name: resourceName(r),
        from: { type: 'project', id, title: project?.name ?? '', projectId: id },
      })
      window.open(url, '_blank', 'noopener,noreferrer')
    }),
  })
  // Across the page's columns (DES-001 section 4): the tree takes half, its blocks the rest, or
  // they go under it when there is no column to spare.
  const page = useRef<HTMLDivElement>(null)
  const columns = useColumns(page)
  // A wide view (the board) is the whole width; the blocks go under it.
  const wide = views.find((v) => v.id === view)?.wide === true
  const { main: mainColumns, side } = wide
    ? { main: columns, side: columns }
    : splitColumns(columns)

  return (
    <div ref={page} className="flex min-w-0 flex-1 flex-col">
      <section aria-label="Project at a glance" className="mb-4 min-w-0">
        <ProjectHead id={id} views={views} view={view} onView={pickView} />
      </section>

      <div
        data-project-columns={columns}
        className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[repeat(var(--columns),minmax(0,1fr))]"
        style={{ '--columns': columns, '--main': mainColumns } as CSSProperties}
      >
        {main && (
          // Named for a screen reader; on screen the tree's own column names head it.
          <section
            id={PROJECT_MAIN}
            aria-labelledby="project-main"
            data-panel={main.moduleLabel}
            className="min-w-0 lg:col-span-(--main)"
          >
            <h2 id="project-main" className="sr-only">
              {main.moduleLabel}
            </h2>
            <main.Component projectId={id} view={view} />
          </section>
        )}
        <ProjectLinked projectId={id} columns={side} beside={mainColumns < columns} />
      </div>
    </div>
  )
}
