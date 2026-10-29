import type { ObjectType, ProjectId } from '@ctws/contracts'
import { useEveryProject } from './api'
import { useNavigate } from 'react-router-dom'
import { inColumns } from '../../platform/ui/columns'
import { useKindBlocks } from '../links/KindBlocks'
import { useRegistry, type Registry } from '../registry'

/** A project's blocks in FR-055's order; a kind no module draws yet is left out. */
const ORDER: readonly ObjectType[] = [
  'meeting',
  'communication',
  'person',
  'organisation',
  'reading',
  'note',
]

/** The kinds of the project's blocks: those in FR-055's order some module draws. */
export const projectLinkKinds = (registry: Registry): ObjectType[] =>
  ORDER.filter((k) => registry.relations.some((r) => r.type === k))

/**
 * THE PROJECT'S BLOCKS (FR-055, DES-001 section 4): the meetings coming up, who is waiting for a
 * reply, its people, its organisations, its reading and its notes, a block each. Beside the tree
 * when the page has columns to spare, one block a column; under it otherwise, two across. A block
 * with nothing in it is its head, after the full ones; its + makes a new thing in the project, or
 * links one where its kind does not belong to a project. People and organisations are found
 * first: the + puts one already written down on the project, and the last row writes one new.
 */
export function ProjectLinked({
  projectId,
  columns,
  beside,
}: {
  projectId: ProjectId
  columns: number
  beside: boolean
}) {
  const registry = useRegistry()
  const navigate = useNavigate()
  const kinds = projectLinkKinds(registry)
  // One hook per module that lists its own things: the registry's list is fixed.
  const owned = registry.projectThings.map((t) => ({ kind: t.kind, ...t.useThings(projectId) }))
  const name = useEveryProject().data?.find((p) => p.id === projectId)?.name
  const { blocks: nodes, picker } = useKindBlocks({
    of: { type: 'project', id: projectId },
    ...(name ? { ofName: name } : {}),
    kinds,
    owned,
    // A project's messages are the ones awaiting a reply (artboard 8, U-12).
    titles: { communication: 'Awaiting reply' },
    // A kind the project owns is made in it; another is linked to it.
    creatorFor: (kind) =>
      owned.some((o) => o.kind === kind)
        ? (registry.creates.find((c) => c.kind === kind) ?? null)
        : null,
    // An organisation is linked, not owned; its + can still write a new one down, on its own
    // form, filled with the words typed, which links it here and comes back (FR-055).
    makesFor: (kind) => {
      const creator = registry.creates.find((c) => c.kind === kind)
      return kind === 'organisation' && typeof creator?.to === 'string'
        ? {
            label: 'New organisation',
            run: (name) => navigate(`${creator.to}?project=${projectId}`, { state: { name } }),
          }
        : undefined
    },
  })

  return (
    <>
      {beside ? (
        inColumns(nodes, columns).map((column, i) => (
          <div key={i} data-project-side className="flex min-w-0 flex-col gap-3">
            {column}
          </div>
        ))
      ) : (
        <div
          data-project-under
          className="col-span-full grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-2"
        >
          {nodes}
        </div>
      )}
      {/* The picker, mounted by the hook while a block's + links a thing. */}
      {picker}
    </>
  )
}
