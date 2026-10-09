import type { LinkKind, ObjectType } from '@ctws/contracts'
import type { Queryable } from '../db/client'

/**
 * HOW A MODULE SAYS WHAT ITS OWN THINGS ARE CALLED -- the `relations` contribution, API side.
 *
 * The shell owns the edges, so the shell is what has to be able to name what is at the end of
 * one. It cannot do that by reading another module's table: it would have to know all four, and
 * the seam would be a seam in name only. So each module hands over one of these, and the shell
 * asks it.
 *
 * The result is that a module still knows nothing about the others. It names ITS type and says
 * nothing about who links to it.
 */
export type Linkable = {
  /** Which kind of thing this names. Exactly one module answers for each. */
  type: ObjectType
  /** The heading a group of these gets on an object page: 「会议 2」. */
  label: string
  /**
   * Names a batch of this module's things, leaving OUT every id it cannot see.
   *
   * Batched because an object page draws a whole group at once, and the shell will not make one
   * query per row. An id that is missing from the result is an edge pointing at something
   * soft-deleted or from another workspace; the shell drops the edge rather than drawing a blank.
   */
  name: (
    q: Queryable,
    workspaceId: string,
    ids: readonly string[],
  ) => Promise<Map<string, { title: string; detail: string | null }>>
  /**
   * THIS MODULE'S THINGS BY NAME, for the picker that makes an edge.
   *
   * The same seam as `name`, the other way round: the shell knows which kinds may be joined and
   * draws the picker, but only the module can search its own table. An empty `text` means "the
   * most likely few" -- the picker opens before anything is typed, and an empty list there reads
   * as "there is nothing", which is a different and usually untrue thing.
   */
  find: (
    q: Queryable,
    workspaceId: string,
    text: string,
    limit: number,
  ) => Promise<{ id: string; title: string; detail: string | null }[]>
  /**
   * EDGES THIS MODULE STORES ITSELF, rather than in the edge table.
   *
   * One case, and it is a real one: a task's project is a NOT NULL column, because the task tree
   * is built on it -- every query in that module reaches for it, and moving it into a nullable
   * edge would be a rewrite of the module to gain nothing. So the task module reports that column
   * AS an edge, and an object page sees one uniform set of edges whichever way they are stored.
   *
   * Called with the object whose page is being drawn, in either direction. Returning nothing is
   * the normal answer for a module whose edges all live in the edge table.
   */
  own?: (
    q: Queryable,
    workspaceId: string,
    of: { type: ObjectType; id: string },
  ) => Promise<StoredEdge[]>
}

/** An edge as any source reports it, before the far end has been named. */
export type StoredEdge = {
  fromType: ObjectType
  fromId: string
  toType: ObjectType
  toId: string
  kind: LinkKind
}
