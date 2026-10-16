import { z } from 'zod'
import { projectId, workspaceId } from './id'
import { instant, nameText, patchOf } from './common'
import { LIST_PAGE, pageInfo, pageQuery } from './page'

/**
 * A project's colour is a slot naming a `--color-project-N` token, not a colour value: each token
 * holds a different hex in light and dark.
 */
export const projectColors = [
  'project-1',
  'project-2',
  'project-3',
  'project-4',
  'project-5',
  'project-6',
] as const
const projectColor = z.enum(projectColors)
export type ProjectColor = z.infer<typeof projectColor>

export const projectParams = z.object({ id: projectId }).strict()

export const createProjectBody = z
  .object({
    name: nameText,
  })
  .strict()

export const updateProjectBody = patchOf({
  name: nameText,
  color: projectColor,
  archived: z.boolean(),
})

export const projectResponse = z.object({
  id: projectId,
  workspaceId,
  name: z.string(),
  color: projectColor,
  isInbox: z.boolean(),
  rank: z.string(),
  archivedAt: instant.nullable(),
  createdAt: instant,
})

/**
 * A project in the list: the row, plus the counts modules add to it, each under the name its
 * module registered.
 */
export const projectListItem = projectResponse.extend({
  columns: z.record(z.string(), z.number().int().nonnegative()),
})

export const projectListQuery = z
  .object({ archived: z.enum(['true', 'false']).optional(), ...pageQuery(LIST_PAGE) })
  .strict()

export const projectListResponse = z.object({
  projects: z.array(projectListItem),
  page: pageInfo,
})

export type CreateProjectBody = z.infer<typeof createProjectBody>
export type UpdateProjectBody = z.infer<typeof updateProjectBody>
export type ProjectResponse = z.infer<typeof projectResponse>
export type ProjectListItem = z.infer<typeof projectListItem>
