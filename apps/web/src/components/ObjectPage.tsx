import type { ObjectType } from '@ctws/contracts'
import { useParams, useSearchParams } from 'react-router-dom'
import { projectBlocks, relationFor } from '../modules/registry'
import { DangerZone } from './DangerZone'
import { Links } from './Links'
import { Panel } from './Panel'
import { ViewTabs } from './ViewTabs'
import { useCrumbs } from './Location'
import { useEveryProject } from '../api/projects'
import { useForgetWhenGone, useRecordRecent } from '../recent'

/**
 * A PAGE FOR A THING THAT IS A PLACE.
 *
 * Only a project has one now. A person and a meeting are RECORDS: you glance at them from
 * wherever you were, so each is a layer over its own list (`/people/<id>`, `/meetings/<id>`),
 * the way a task has always been a layer over its project. A record that took the whole window
 * away made you leave the list to read six fields and then find your way back.
 *
 * A project is different in kind: it is a place you work in, with a task tree that drags, folds
 * and takes new rows. That is why its block stays a module's own rather than a list of links --
 * replacing the tree with backlinks would be losing the module's editor to make a page uniform.
 *
 * THE SHELL OWNS THE PAGE. What it cannot know is what a project IS, so the module that answers
 * for the type fills the head (`relations.Head`). Everything under it is edges, which are the
 * shell's, read from both directions.
 */
/**
 * The kinds a project page already shows in a module's own block, and so does not repeat under
 * Linked.
 *
 * Exactly one: the task tree. Every other module's rows reach a project as edges, and the links
 * panel draws every kind of edge the same way. A tree is not a list, so it stays.
 */
const BLOCKED_ON_A_PROJECT: ObjectType[] = ['task']

export function ObjectPage({ type }: { type: ObjectType }) {
  const { id } = useParams()
  const where = relationFor(type)
  const views = useBlockViews()
  // Live or archived: an archived project still has its page.
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)
  const gone = type === 'project' && projects.isSuccess && !project
  // Until the list is in there is no name to give; once it is, a project that is not in it is
  // named for what the page says about it, never left blank.
  const name = project?.name ?? (gone ? 'Not found' : null)
  useCrumbs(
    type === 'project'
      ? name
        ? [{ label: 'Projects', to: '/projects' }, { label: name }]
        : []
      : null,
  )
  useForgetWhenGone('project', id ?? null, gone)
  useRecordRecent(
    type === 'project' && id && project
      ? { type: 'project', id, title: project.name, to: `/projects/${id}`, kind: 'Project' }
      : null,
  )

  if (!id) return null
  const Head = where?.Head
  const Destroy = where?.Destroy
  // The kinds a module already draws on THIS page, in its own block.
  const covered: ObjectType[] = type === 'project' ? BLOCKED_ON_A_PROJECT : []

  return (
    <>
      {/* THE HEAD: the name at the scale's 2xl step and one sentence of numbers -- no tiles, no
          bar. Hung where the rows' thread hangs, like every heading on a page of rows. */}
      <section
        aria-label={`${where?.kind ?? 'Thing'} at a glance`}
        className="mb-8 ml-15 min-w-0 pt-2 sm:ml-18"
      >
        {Head ? <Head id={id} /> : null}
      </section>

      {/*
        A CROSSING POINT: the project's own block -- the task tree -- takes the main column, and
        every other kind that meets this project sits beside it, each in a block of its own.

        BESIDE ONLY WHERE THERE IS ROOM, by the column's own width (a container query), not the
        window's: with the task detail open at 1440 the third column is the detail's, the main
        column is 750px, and a 20rem aside beside the tree as well would leave it a sliver. There
        Linked goes under the tree, as it does on a phone.
      */}
      <div className="@container">
        <div className="grid min-w-0 grid-cols-1 items-start gap-10 @5xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:gap-14">
          <div className="flex min-w-0 flex-col gap-4">
            {type === 'project' &&
              projectBlocks().map(({ moduleId, moduleLabel, Component, views: offered = [] }) => {
                const chosen =
                  offered.find((v) => v.id === views.picked.get(moduleId))?.id ??
                  offered[0]?.id ??
                  'default'
                const Action = projectBlocks().find((b) => b.moduleId === moduleId)?.Action
                return (
                  <Panel
                    key={moduleId}
                    label={moduleLabel}
                    hang
                    /* `ViewTabs` draws nothing for a single view, so a block with one is not given
                       a tab bar that decides nothing. */
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
              })}
          </div>
          {/* AND WHAT IT IS CONNECTED TO: the people, the reading and the meetings -- everything
              except the tasks, which the tree already draws. Saying a row twice is the one thing a
              reader has to hold two of in their head.
              Below the tree it is one column with it: on the tree's edge, past its margin, so its
              threads and headings are the tree's and not a margin's width to the left of them.
              Beside it, it is a column of its own and starts at its own edge. */}
          <section
            aria-label="Linked"
            data-panel="Linked"
            className="min-w-0 @max-5xl:ml-15 sm:@max-5xl:ml-18 @5xl:pt-1"
          >
            <Links of={{ type, id }} except={covered} variant="aside" />
          </section>
        </div>
      </div>

      {/* LAST ON THE PAGE, below everything, in the danger colour: the one action here that
          cannot be undone, where nothing is reached by passing over it (`DangerZone`). */}
      {Destroy && (
        <DangerZone>
          <Destroy id={id} />
        </DangerZone>
      )}
    </>
  )
}

/**
 * WHICH VIEW EACH BLOCK IS SHOWING, in the URL as `?view=<module>:<id>`.
 *
 * In the URL rather than in state so a reload and a shared link both land where the person was;
 * prefixed by module so a second module's views cannot be confused for this one's. A value naming
 * a view that does not exist falls back to the block's first, which is also what a bare link gets.
 */
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
