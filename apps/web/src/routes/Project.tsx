import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
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
export function Project() {
  const { id } = useParams()
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
          projectViews().map(({ moduleId, moduleLabel, Component }) => {
            const action = projectViewActions().find((a) => a.moduleId === moduleId)
            return (
              <Panel
                key={moduleId}
                label={moduleLabel}
                action={action ? <action.Component projectId={id} /> : undefined}
              >
                <Component projectId={id} />
              </Panel>
            )
          })}
      </div>
    </>
  )
}
