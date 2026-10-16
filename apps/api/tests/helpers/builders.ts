import {
  projectId as projectIdSchema,
  taskId,
  type createMeetingBody,
  type createPersonBody,
  type createReadingItemBody,
  type createTaskBody,
  type MeetingOccurrence,
  type PersonResponse,
  type ProjectId,
  type ReadingItemResponse,
  type TaskId,
} from '@ctws/contracts'
import type { z } from 'zod'
import type { Harness } from './harness'

/**
 * One builder per entity, for tests whose subject is what comes after the thing exists. Each posts
 * through the API, so the row is one the app itself would make, and throws on any answer but the
 * one a create gives: a setup that fails stops the test there, not at a confusing later assertion.
 * A test about creating itself writes its own request; so does every link test, since each is
 * about making the link.
 */
async function create<T>(ctx: Harness, url: string, payload: object): Promise<T> {
  const res = await ctx.app.inject({ method: 'POST', url, headers: ctx.authed, payload })
  if (res.statusCode !== 201) throw new Error(`POST ${url}: ${res.statusCode} ${res.body}`)
  return res.json() as T
}

export async function createProject(ctx: Harness, name = 'P'): Promise<ProjectId> {
  const project = await create<{ id: string }>(ctx, '/api/v1/projects', { name })
  return projectIdSchema.parse(project.id)
}

export async function createTask(
  ctx: Harness,
  projectId: ProjectId,
  title: string,
  parentId?: TaskId,
  fields: Omit<z.input<typeof createTaskBody>, 'projectId' | 'title' | 'parentId'> = {},
): Promise<TaskId> {
  const task = await create<{ id: string }>(ctx, '/api/v1/tasks', {
    projectId,
    title,
    ...(parentId ? { parentId } : {}),
    ...fields,
  })
  return taskId.parse(task.id)
}

/**
 * A straight parent->child chain `depth` nodes long. Returns ids root-first, so
 * `chain[0]` is at depth 1 and `chain[depth - 1]` is the leaf at depth `depth`.
 */
export async function createChain(
  ctx: Harness,
  projectId: ProjectId,
  depth: number,
): Promise<TaskId[]> {
  const ids: TaskId[] = []
  let parent: TaskId | undefined
  for (let i = 0; i < depth; i++) {
    parent = await createTask(ctx, projectId, `n${i}`, parent)
    ids.push(parent)
  }
  return ids
}

export const createPerson = (
  ctx: Harness,
  fields: Partial<z.input<typeof createPersonBody>> = {},
): Promise<PersonResponse> => create(ctx, '/api/v1/people', { name: 'Ying', ...fields })

/** A one-off half hour unless `fields` say otherwise. The answer is its first occurrence. */
export const createMeeting = (
  ctx: Harness,
  fields: Partial<z.input<typeof createMeetingBody>> = {},
): Promise<MeetingOccurrence> =>
  create(ctx, '/api/v1/meetings', {
    title: 'Standup',
    startsLocal: '2026-03-02T09:00',
    timeZone: 'UTC',
    durationMinutes: 30,
    ...fields,
  })

export const createReading = (
  ctx: Harness,
  fields: z.input<typeof createReadingItemBody> = { kind: 'book', title: 'Dune' },
): Promise<ReadingItemResponse> => create(ctx, '/api/v1/reading', fields)
