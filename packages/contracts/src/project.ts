import { z } from 'zod'
import { projectId, stageId, workspaceId } from './id'
import { instant, nameText, patchOf } from './common'
import { LIST_PAGE, pageInfo, pageQuery } from './page'

/**
 * A project's colour is one of eight names (FR-004, tokens.md), each a `--color-project-<name>`
 * token; the square is a solid fill with the initials in white, the same hex in light and dark.
 */
export const projectColors = [
  'blue',
  'amber',
  'green',
  'violet',
  'red',
  'olive',
  'teal',
  'pink',
] as const
const projectColor = z.enum(projectColors)
export type ProjectColor = z.infer<typeof projectColor>

/** One or two characters on the square (FR-052); taken from the name unless given. */
const initials = z.string().trim().min(1).max(2)

export const projectParams = z.object({ id: projectId }).strict()

export const createProjectBody = z
  .object({
    name: nameText,
    /** A colour not yet used is chosen when left out (FR-052). */
    color: projectColor.optional(),
    initials: initials.optional(),
  })
  .strict()

export const updateProjectBody = patchOf({
  name: nameText,
  color: projectColor,
  initials,
  archived: z.boolean(),
})

/** One of a project's stages, with how many live tasks are at it. */
export const stageResponse = z.object({
  id: stageId,
  name: z.string(),
  collapsed: z.boolean(),
  count: z.number().int().nonnegative(),
})
export type StageResponse = z.infer<typeof stageResponse>

const stageName = z.string().trim().min(1).max(60)

/**
 * A project's stages as a whole list (FR-040): the order given is the order; an entry with an
 * `id` renames that stage, one without is new, a stage left out is removed (only an unused one
 * may be). `mergeInto` moves this stage's tasks into another and drops it.
 */
export const putStagesBody = z
  .object({
    stages: z
      .array(
        z
          .object({
            id: stageId.optional(),
            name: stageName,
            collapsed: z.boolean().optional(),
            mergeInto: stageId.optional(),
          })
          .strict()
          .refine((s) => s.mergeInto === undefined || s.id !== undefined, {
            message: 'only an existing stage can be merged into another',
            path: ['mergeInto'],
          }),
      )
      .max(50),
  })
  .strict()
export type PutStagesBody = z.infer<typeof putStagesBody>

export const stagesResponse = z.object({ stages: z.array(stageResponse) })

/** A project, with the counts modules add to it, each under the name its module registered. */
export const projectResponse = z.object({
  id: projectId,
  workspaceId,
  name: z.string(),
  color: projectColor,
  initials: z.string(),
  isInbox: z.boolean(),
  rank: z.string(),
  archivedAt: instant.nullable(),
  createdAt: instant,
  columns: z.record(z.string(), z.number().int().nonnegative()),
  /** In the project's order; empty when nothing in it has a stage. */
  stages: z.array(stageResponse),
})

export const projectListQuery = z
  .object({ archived: z.enum(['true', 'false']).optional(), ...pageQuery(LIST_PAGE) })
  .strict()

export const projectListResponse = z.object({
  projects: z.array(projectResponse),
  page: pageInfo,
})

export type CreateProjectBody = z.infer<typeof createProjectBody>
export type UpdateProjectBody = z.infer<typeof updateProjectBody>
export type ProjectResponse = z.infer<typeof projectResponse>
