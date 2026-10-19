import type { StageResponse, TaskResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createProject, createTask } from '../helpers/builders'
import { appWithUser, eventsOf, type Harness } from '../helpers/harness'

/**
 * STAGES (FR-040, FR-058, REQ v1.4): a project's own list of where a thing has got to. Any node
 * may be at one; the list is renamed, reordered, trimmed or merged as a whole; a stage still in
 * use stays.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  const projectId = await createProject(ctx, 'Job hunt')
  return { ctx, projectId }
}

const put = (ctx: Harness, projectId: string, stages: object[]) =>
  ctx.app.inject({
    method: 'PUT',
    url: `/api/v1/projects/${projectId}/stages`,
    headers: ctx.authed,
    payload: { stages },
  })

const names = (res: { json: () => unknown }) =>
  (res.json() as { stages: StageResponse[] }).stages.map((s) => [s.name, s.count])

const setStage = (ctx: Harness, task: string, stageId: string | null) =>
  ctx.app.inject({
    method: 'PATCH',
    url: `/api/v1/tasks/${task}`,
    headers: ctx.authed,
    payload: { stageId },
  })

describe('a project’s stages', () => {
  it('are a list of its own, remembered in order, and shown on the project', async () => {
    const { ctx, projectId } = await setup()
    const made = await put(ctx, projectId, [
      { name: 'Applied' },
      { name: 'Phone screen' },
      { name: 'Onsite' },
    ])
    expect(made.statusCode, made.body).toBe(200)
    expect(names(made)).toEqual([
      ['Applied', 0],
      ['Phone screen', 0],
      ['Onsite', 0],
    ])

    const project = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}`,
      headers: ctx.authed,
    })
    expect((project.json() as { stages: StageResponse[] }).stages.map((s) => s.name)).toEqual([
      'Applied',
      'Phone screen',
      'Onsite',
    ])
  })

  it('are set on any node, logged by name, and timed from when they changed', async () => {
    const { ctx, projectId } = await setup()
    const [applied, onsite] = (
      await put(ctx, projectId, [{ name: 'Applied' }, { name: 'Onsite' }])
    ).json().stages as StageResponse[]
    const stripe = await createTask(ctx, projectId, 'Stripe')
    const leaf = await createTask(ctx, projectId, 'Prep', stripe)

    expect((await setStage(ctx, stripe, applied!.id)).statusCode).toBe(200)
    // A leaf too (REQ v1.4).
    expect((await setStage(ctx, leaf, applied!.id)).statusCode).toBe(200)
    const moved = (await setStage(ctx, stripe, onsite!.id)).json() as TaskResponse
    expect(moved.stageId).toBe(onsite!.id)
    expect(moved.stageSince).not.toBeNull()

    const events = (await eventsOf(ctx, stripe)).filter((e) => e.type === 'stage_changed')
    expect(events.map((e) => e.payload)).toEqual([
      { from: null, to: 'Applied' },
      { from: 'Applied', to: 'Onsite' },
    ])
    expect(
      names(
        await put(ctx, projectId, [
          { id: applied!.id, name: 'Applied' },
          { id: onsite!.id, name: 'Onsite' },
        ]),
      ),
    ).toEqual([
      ['Applied', 1],
      ['Onsite', 1],
    ])
  })

  it('refuses a stage of another project, and clears the stage when a task moves projects', async () => {
    const { ctx, projectId } = await setup()
    const other = await createProject(ctx, 'CTWS')
    const [theirs] = (await put(ctx, other, [{ name: 'Spec review' }])).json()
      .stages as StageResponse[]
    const task = await createTask(ctx, projectId, 'Amazon')
    expect((await setStage(ctx, task, theirs!.id)).statusCode).toBe(404)

    const [applied] = (await put(ctx, projectId, [{ name: 'Applied' }])).json()
      .stages as StageResponse[]
    await setStage(ctx, task, applied!.id)
    const moved = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task}`,
      headers: ctx.authed,
      payload: { projectId: other, parentId: null },
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect((moved.json() as TaskResponse).stageId).toBeNull()
  })

  it('renames in place, removes only an unused stage, and merges on request', async () => {
    const { ctx, projectId } = await setup()
    const [a, b, c] = (
      await put(ctx, projectId, [
        { name: 'Applied' },
        { name: 'Phone Screen' },
        { name: 'Rejected' },
      ])
    ).json().stages as StageResponse[]
    const t1 = await createTask(ctx, projectId, 'GitLab')
    const t2 = await createTask(ctx, projectId, 'Datadog')
    await setStage(ctx, t1, b!.id)
    await setStage(ctx, t2, b!.id)

    // Rename keeps the id and the tasks.
    const renamed = await put(ctx, projectId, [
      { id: a!.id, name: 'Applied' },
      { id: b!.id, name: 'Phone screen' },
      { id: c!.id, name: 'Rejected' },
    ])
    expect(names(renamed)).toEqual([
      ['Applied', 0],
      ['Phone screen', 2],
      ['Rejected', 0],
    ])

    // A stage in use cannot be left out; an unused one can.
    const inUse = await put(ctx, projectId, [
      { id: a!.id, name: 'Applied' },
      { id: c!.id, name: 'Rejected' },
    ])
    expect(inUse.statusCode).toBe(409)
    expect(inUse.json().detail).toBe('2 tasks are at Phone screen; move them first')
    const trimmed = await put(ctx, projectId, [
      { id: a!.id, name: 'Applied' },
      { id: b!.id, name: 'Phone screen' },
    ])
    expect(names(trimmed)).toEqual([
      ['Applied', 0],
      ['Phone screen', 2],
    ])

    // Renaming onto an existing name is a question; answered with mergeInto, the tasks move.
    const clash = await put(ctx, projectId, [
      { id: a!.id, name: 'Applied' },
      { id: b!.id, name: 'Applied' },
    ])
    expect(clash.statusCode).toBe(409)
    expect(clash.json().detail).toBe('Applied already exists')
    const merged = await put(ctx, projectId, [
      { id: a!.id, name: 'Applied' },
      { id: b!.id, name: 'Applied', mergeInto: a!.id },
    ])
    expect(merged.statusCode, merged.body).toBe(200)
    expect(names(merged)).toEqual([['Applied', 2]])
    expect(
      (await eventsOf(ctx, t1)).filter((e) => e.type === 'stage_changed').at(-1)?.payload,
    ).toEqual({
      from: 'Phone screen',
      to: 'Applied',
      merged: true,
    })
  })
})
