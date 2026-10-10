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
  /** The heading a group of these gets on an object page, with its count beside it. */
  label: string
  /**
   * THIS MODULE'S THINGS, named.
   *
   * ONE method and not two, because naming the far end of an edge and searching for something to
   * link to are the same query with a different `where`. Two of them is the same fifteen lines in
   * each of five modules, free to drift apart.
   *
   * Always leaves OUT what it cannot see. An id that does not come back is an edge pointing at
   * something soft-deleted or in another workspace, and the shell drops the edge rather than
   * drawing a blank. Batched for the same reason: a page draws a whole group at once and the
   * shell will not make one query per row.
   */
  rows: (q: Queryable, workspaceId: string, want: Want) => Promise<NamedRow[]>
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

/**
 * WHICH of a module's things to fetch: the ones with these ids, or the ones matching some text.
 *
 * An empty `text` means "the most likely few" -- the picker opens before anything is typed, and
 * an empty list there reads as "there is nothing", which is a different and usually untrue thing.
 */
type Want = { ids: readonly string[] } | { text: string; limit: number }

/** One of a module's things, as the shell shows it: a line and a phrase under it. */
type NamedRow = { id: string; title: string; detail: string | null }

/** An edge as any source reports it, before the far end has been named. */
export type StoredEdge = {
  fromType: ObjectType
  fromId: string
  toType: ObjectType
  toId: string
  kind: LinkKind
}
