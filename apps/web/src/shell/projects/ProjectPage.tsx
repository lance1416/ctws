import { useParams, useSearchParams } from 'react-router-dom'
import { DangerZone } from '../../platform/ui/DangerZone'
import { Panel } from '../../platform/ui/Panel'
import { ViewTabs } from '../../platform/ui/ViewTabs'
import { useCrumbs } from '../layout/Location'
import { Links } from '../links/Links'
import { useRegistry } from '../registry'
import { useForgetWhenGone, useRecordRecent } from '../search/recent'
import { useEveryProject } from './api'
import { DeleteProject } from './DeleteProject'
import { ProjectHead } from './ProjectHead'
import { HANG } from '../../platform/ui/hang'

/**
 * A project's page: its head, each module's block of rows, everything linked to it, and its
 * delete at the foot. A project is a place you work in, so it has a page; other records open as a
 * pane over their list.
 */
export function ProjectPage() {
  const { id } = useParams()
  const registry = useRegistry()
  const views = useBlockViews()
  // Live or archived: an archived project still has its page.
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)
  const gone = projects.isSuccess && !project
  const name = project?.name ?? (gone ? 'Not found' : null)
  useCrumbs(name ? [{ label: 'Projects', to: '/projects' }, { label: name }] : [])
  useForgetWhenGone('project', id ?? null, gone)
  useRecordRecent(
    id && project
      ? { type: 'project', id, title: project.name, to: `/projects/${id}`, kind: 'Project' }
      : null,
  )

  if (!id) return null
  // Kinds a module already draws in its own block here are not repeated under Linked.
  const blockModules = new Set(registry.projectBlocks.map((b) => b.moduleId))
  const covered = registry.relations
    .filter((r) => r.moduleId !== null && blockModules.has(r.moduleId))
    .map((r) => r.type)

  return (
    <>
      <section aria-label="Project at a glance" className={`mb-8 ${HANG} min-w-0 pt-2`}>
        <ProjectHead id={id} />
      </section>

      {/* Linked sits beside the blocks only when this column is wide enough (a container query,
          so an open detail pane counts); otherwise it goes under them. */}
      <div className="@container">
        <div className="grid min-w-0 grid-cols-1 items-start gap-10 @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-14">
          <div className="flex min-w-0 flex-col gap-4">
            {registry.projectBlocks.map(
              ({ moduleId, moduleLabel, Component, Action, views: offered = [] }) => {
                const chosen =
                  offered.find((v) => v.id === views.picked.get(moduleId))?.id ??
                  offered[0]?.id ??
                  'default'
                return (
                  <Panel
                    key={moduleId}
                    label={moduleLabel}
                    hang
                    tabs={
                      <ViewTabs
                        views={offered}
                        current={chosen}
                        onPick={(v) => views.pick(moduleId, v)}
                      />
                    }
                    action={Action ? <Action projectId={id} /> : undefined}
                  >
                    <Component projectId={id} view={chosen} />
                  </Panel>
                )
              },
            )}
          </div>
          <section
            aria-label="Linked"
            data-panel="Linked"
            className="min-w-0 @max-5xl:ml-15 sm:@max-5xl:ml-18 @5xl:pt-1"
          >
            <Links of={{ type: 'project', id }} except={covered} variant="aside" />
          </section>
        </div>
      </div>

      <DangerZone>
        <DeleteProject id={id} />
      </DangerZone>
    </>
  )
}

/** Each block's chosen view, kept in the URL as `?view=<module>:<view>`. */
function useBlockViews() {
  const [params, setParams] = useSearchParams()
  const picked = new Map(
    params.getAll('view').map((v) => {
      const at = v.indexOf(':')
      return [v.slice(0, at), v.slice(at + 1)]
    }),
  )
  const pick = (moduleId: string, viewId: string) => {
    const next = new URLSearchParams(params)
    next.delete('view')
    for (const [m, v] of picked) if (m !== moduleId) next.append('view', `${m}:${v}`)
    next.append('view', `${moduleId}:${viewId}`)
    setParams(next, { replace: true })
  }
  return { picked, pick }
}
