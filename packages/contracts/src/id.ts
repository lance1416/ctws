import { z } from 'zod'

/**
 * Ids are uuids, read in lower case: one in upper case names the same thing, so it is folded at
 * the boundary rather than compared case-blind everywhere. Each kind of thing has its own brand,
 * so a project's id passed where a task's is expected does not compile.
 */
const idOf = <Brand extends string>() => z.uuid().toLowerCase().brand<Brand, 'inout'>()

export const taskId = idOf<'TaskId'>()
export type TaskId = z.infer<typeof taskId>

export const projectId = idOf<'ProjectId'>()
export type ProjectId = z.infer<typeof projectId>

export const personId = idOf<'PersonId'>()
export type PersonId = z.infer<typeof personId>

export const meetingId = idOf<'MeetingId'>()
export type MeetingId = z.infer<typeof meetingId>

export const readingId = idOf<'ReadingId'>()
export type ReadingId = z.infer<typeof readingId>

export const linkId = idOf<'LinkId'>()
export type LinkId = z.infer<typeof linkId>

export const relationId = idOf<'RelationId'>()
export type RelationId = z.infer<typeof relationId>

export const resourceId = idOf<'ResourceId'>()
export type ResourceId = z.infer<typeof resourceId>

export const organisationId = idOf<'OrganisationId'>()
export type OrganisationId = z.infer<typeof organisationId>

export const roleId = idOf<'RoleId'>()
export type RoleId = z.infer<typeof roleId>

export const circleId = idOf<'CircleId'>()
export type CircleId = z.infer<typeof circleId>

export const stageId = idOf<'StageId'>()
export type StageId = z.infer<typeof stageId>

export const workspaceId = idOf<'WorkspaceId'>()
export type WorkspaceId = z.infer<typeof workspaceId>

export const userId = idOf<'UserId'>()
export type UserId = z.infer<typeof userId>

/**
 * A string from outside any schema (a path segment, a stored recent) read as an id of `schema`'s
 * kind. Not checked: a malformed one is the server's to refuse, as it would be unbranded.
 */
export const idFrom = <Schema extends z.ZodType<string>>(_schema: Schema, value: string) =>
  value.toLowerCase() as z.infer<Schema>

/** The id of a thing at either end of a link; the `type` beside it says which kind. */
export const objectId = z.uuid().toLowerCase()
