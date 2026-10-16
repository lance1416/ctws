import { z } from 'zod'
import { instant } from './common'

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
export const projectColor = z.enum(projectColors)
export type ProjectColor = z.infer<typeof projectColor>

export const createProjectBody = z
  .object({
    name: z.string().trim().min(1).max(200),
  })
  .strict()

export const updateProjectBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    color: projectColor,
    archived: z.boolean(),
  })
  .partial()
  .strict()

export const projectResponse = z
  .object({
    id: z.uuid(),
    workspaceId: z.uuid(),
    name: z.string(),
    color: projectColor,
    isInbox: z.boolean(),
    rank: z.string(),
    archivedAt: instant.nullable(),
    createdAt: instant,
  })
  .strict()

/** A project in the list: the row plus the count of tasks neither finished, cancelled nor deleted. */
export const projectListItem = projectResponse
  .extend({ openTasks: z.number().int().nonnegative() })
  .strict()

export const projectListQuery = z
  .object({ archived: z.enum(['true', 'false']).optional() })
  .strict()

export const projectListResponse = z.object({ projects: z.array(projectListItem) }).strict()

export type CreateProjectBody = z.infer<typeof createProjectBody>
export type UpdateProjectBody = z.infer<typeof updateProjectBody>
export type ProjectResponse = z.infer<typeof projectResponse>
export type ProjectListItem = z.infer<typeof projectListItem>
