import { z } from 'zod'
import { instant } from './common'
import { objectId, projectId } from './id'
import { objectType } from './object'

/**
 * Where a deleted thing was (FR-035): enough for its old address to say what it was and offer
 * the way to what held it. A task has its project, its parent and the titles above it; a meeting
 * or a reading item its project; a note the thing it hung on; a person or a project nothing.
 */
const tombstonePlace = z.object({
  projectId: projectId.nullable(),
  projectName: z.string().nullable(),
  /** What it hung under: a task's parent task, a note's anchor. */
  parentType: objectType.nullable(),
  parentId: objectId.nullable(),
  /** The titles above a task, root first. */
  path: z.array(z.string()),
})
export type TombstonePlace = z.infer<typeof tombstonePlace>

export const tombstoneParams = z.object({ type: objectType, id: objectId }).strict()

/** What is left of a deleted thing: its name, when it went, and where it was. */
export const tombstoneResponse = z.object({
  type: objectType,
  id: objectId,
  title: z.string(),
  deletedAt: instant,
  place: tombstonePlace,
})
export type TombstoneResponse = z.infer<typeof tombstoneResponse>
