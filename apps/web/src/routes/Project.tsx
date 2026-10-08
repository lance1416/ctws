import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { Panel } from '../components/Panel'
import { projectHeadlines, projectViewActions, projectViews } from '../modules/registry'
import { useProjectRail } from '../projectColor'

/**
 * A project page, laid out as the workbench is (workbench spec §2): a HEADER BANNER carrying this
 * line of work's state, and under it the rows, in a panel.
 *
 * Projects are the SHELL's organising dimension (module-boundary contract §3) -- the user's life
 * runs in lines of work (CTWS / job hunt / open source) and a note about CTWS belongs to CTWS as
 * plainly as a task does. So the page, the banner and the panel are the shell's, and both what
 * fills the banner and what fills the panel are asked of the REGISTRY rather than imported by
 * name: a page that imported the task module's tree would be a page no second module could ever
 * appear on. §3 also flags this as the ruling most likely to be overturned by the notes module,
 * which is why the modules are composed here rather than entangled.
 *
 * THE THREE COLUMNS of §2's project page are the shell's (Layout): the rail, this page, and the
 * detail. The detail is the third of them at >=1280 and the rows take the other two, which is why
 * there is no second three-column grid inside this page -- one would leave a third of the width
 * empty whenever the detail is closed, which is the dead space the workbench exists to remove.
 */
/**
 * The tabs in a block's head. Fewer than two views draws nothing: a tab bar with one tab is
 * chrome that decides nothing, and the block's name already says what is in it.
 *
 * A real `tablist`, so the arrow keys and the `aria-selected` pair are what a screen reader
 * expects -- these are views of one block, not links to other pages.
 */
function ViewTabs({
  views,
  current,
  onPick,
}: {
  views: readonly { id: string; label: string }[]
  current: string
  onPick: (id: string) => void
}) {
  if (views.length < 2) return null
  return (
    <span role="tablist" className="flex items-center gap-0.5">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={v.id === current}
          onClick={() => onPick(v.id)}
          className={`h-8 rounded-lg px-2.5 text-sm ${
            v.id === current
              ? 'bg-surface-sunken text-fg'
              : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
          }`}
        >
          {v.label}
        </button>
      ))}
    </span>
  )
}

export function Project() {
  const { id } = useParams()
  /**
   * WHICH VIEW EACH BLOCK IS SHOWING, in the URL as `?view=<module>:<id>`.
   *
   * In the URL rather than in state so a reload and a shared link both land where the person
   * was; prefixed by module so a second module's views cannot be confused for this one's. A
   * value naming a view that does not exist falls back to the block's first, which is also what
   * a bare project link gets.
   */
  const [params, setParams] = useSearchParams()
  const picked = new Map(
    params.getAll('view').map((v) => {
      const at = v.indexOf(':')
      return [v.slice(0, at), v.slice(at + 1)]
    }),
  )
  const pickView = (moduleId: string, viewId: string) => {
    const next = new URLSearchParams(params)
    next.delete('view')
    for (const [m, v] of picked) if (m !== moduleId) next.append('view', `${m}:${v}`)
    next.append('view', `${moduleId}:${viewId}`)
    setParams(next, { replace: true })
  }
  // Same query function as every other reader of ['projects']: they share one cache entry, so
  // they must agree on its shape.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const rail = useProjectRail()
  const name = projects.data?.find((p) => p.id === id)?.name

  return (
    <>
      {/* The banner, in the same language as 今天's 正在做 strip: one accent edge, the top step
          of the type scale spent on its subject, and the numbers that say where it stands beside
          it. Its subject here is the LINE OF WORK, so the project's name takes that top step. */}
      <Panel
        label="项目概况"
        className="border-l-4 border-l-accent"
        heading={<h2 className="text-xs font-semibold text-fg-subtle">项目</h2>}
      >
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-3 px-2 pb-1">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* A chip, never a text colour and never alone: the project's NAME is right here
                beside it (WCAG 1.4.1). Not `data-project-rail` -- this is not a task row and must
                not be measured as one. */}
            {id && (
              <span
                aria-hidden="true"
                data-project-chip={id}
                className={`h-7 w-[4px] shrink-0 rounded-full ${rail(id)}`}
              />
            )}
            <h1
              id="project-heading"
              tabIndex={-1}
              className="min-w-0 truncate text-xl font-semibold focus:outline-none"
            >
              {name ?? ''}
            </h1>
          </div>
          {id &&
            projectHeadlines().map(({ moduleId, Component }) => (
              <Component key={moduleId} projectId={id} />
            ))}
        </div>
      </Panel>

      <div className="mt-4 flex min-w-0 flex-col gap-4">
        {id &&
          projectViews().map(({ moduleId, moduleLabel, Component, views }) => {
            const action = projectViewActions().find((a) => a.moduleId === moduleId)
            const view =
              views.find((v) => v.id === picked.get(moduleId))?.id ?? views[0]?.id ?? 'default'
            return (
              <Panel
                key={moduleId}
                label={moduleLabel}
                tabs={
                  <ViewTabs views={views} current={view} onPick={(v) => pickView(moduleId, v)} />
                }
                action={action ? <action.Component projectId={id} /> : undefined}
              >
                <Component projectId={id} view={view} />
              </Panel>
            )
          })}
      </div>
    </>
  )
}
