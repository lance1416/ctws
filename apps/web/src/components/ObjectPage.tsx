import type { ObjectType } from '@ctws/contracts'
import { useParams, useSearchParams } from 'react-router-dom'
import { projectViewActions, projectViews, relationFor } from '../modules/registry'
import { Links } from './Links'
import { Panel } from './Panel'
import { ViewTabs } from './ViewTabs'

/**
 * ONE PAGE FOR EVERY KIND OF THING.
 *
 * A project page, a person's page and a meeting's page were going to be three pages. They are one
 * (framing §2): each is a thing with fields of its own and a set of other things it is connected
 * to, and that is the whole shape. The old project page was a block wall -- one block per module
 * -- which was the module structure drawn for the reader.
 *
 * THE SHELL OWNS THE PAGE. What it cannot know is what a person IS, so the module that answers
 * for the type fills the head (`relations.Head`). Everything under it is edges, which are the
 * shell's, read from both directions.
 *
 * ONE EXCEPTION, and it is deliberate: a module may still hang a block of its own under a project
 * (`ProjectView`). A backlink list of tasks is not a task tree -- no drag, no dependencies, no
 * inline new row -- and replacing the tree with a list of links would be losing the module's
 * editor to make the page uniform. The links panel sits below those blocks and carries everything
 * else.
 */
/**
 * The kinds a project page already shows in a module's own block, and so does not repeat under
 * Linked.
 *
 * Exactly one: the task tree. Three other modules used to hang a list under every project and
 * they do not any more -- their rows are edges, and the links panel draws every kind of edge the
 * same way. A tree is not a list, so it stays.
 */
const BLOCKED_ON_A_PROJECT: ObjectType[] = ['task']

export function ObjectPage({ type }: { type: ObjectType }) {
  const { id } = useParams()
  const where = relationFor(type)
  const views = useBlockViews()

  if (!id) return null
  const Head = where?.Head
  // The kinds a module already draws on THIS page, in its own block.
  const covered: ObjectType[] = type === 'project' ? BLOCKED_ON_A_PROJECT : []

  return (
    <>
      {/* The banner: one accent edge and the top step of the type scale spent on its subject,
          the same language the workbench's own strip speaks. */}
      <Panel
        label={`${where?.kind ?? 'Thing'} at a glance`}
        className="border-l-4 border-l-accent"
        heading={<h2 className="text-xs font-semibold text-fg-subtle">{where?.kind}</h2>}
      >
        {Head ? (
          <div className="px-2 pb-1">
            <Head id={id} />
          </div>
        ) : null}
      </Panel>

      {/* A module's own editor for this kind of thing, where it has one. */}
      {type === 'project' && (
        <div className="mt-4 flex min-w-0 flex-col gap-4">
          {projectViews().map(({ moduleId, moduleLabel, Component, views: offered }) => {
            const chosen =
              offered.find((v) => v.id === views.picked.get(moduleId))?.id ??
              offered[0]?.id ??
              'default'
            const action = projectViewActions().find((a) => a.moduleId === moduleId)
            return (
              <Panel
                key={moduleId}
                label={moduleLabel}
                /* `ViewTabs` draws nothing for a single view, so a block with one is not
                   given a tab bar that decides nothing. */
                tabs={
                  <ViewTabs
                    views={offered}
                    current={chosen}
                    onPick={(v) => views.pick(moduleId, v)}
                  />
                }
                action={action ? <action.Component projectId={id} /> : undefined}
              >
                <Component projectId={id} view={chosen} />
              </Panel>
            )
          })}
        </div>
      )}

      {/* AND WHAT IT IS CONNECTED TO: on a person, the meetings they are in and what they
          recommended -- a screen that was empty before, because those edges had nowhere to live.
          On a project it is the people, the reading and the meetings -- everything except the
          tasks, which the tree above already draws. Saying a row twice is the one thing a reader
          has to hold two of in their head. */}
      <Panel label="Linked" className="mt-4">
        <Links of={{ type, id }} except={covered} />
      </Panel>
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
