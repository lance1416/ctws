import type { RelatedObject, RelationsResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createPerson, createProject, createTask } from '../helpers/builders'
import { appWithUser, eventsOf, type Harness, secondUser } from '../helpers/harness'

/**
 * RELATIONS WITHOUT A KIND (FR-042, FR-027): any two things, joined by hand with an optional line
 * of why, or by one mentioning the other in its text, which carries the sentence. Read from both
 * ends; a mention comes and goes with the text.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  const projectId = await createProject(ctx, 'Job hunt')
  const task = await createTask(ctx, projectId, 'Prepare the system design round')
  const mira = await createPerson(ctx, { name: 'Mira Chen' })
  return { ctx, projectId, task, mira }
}

async function related(
  ctx: Harness,
  type: string,
  id: string,
): Promise<RelationsResponse['groups']> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/relations?type=${type}&id=${id}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as RelationsResponse).groups
}

const itemsOf = (groups: RelationsResponse['groups'], type: string): RelatedObject[] =>
  groups.find((g) => g.type === type)?.items ?? []

async function relate(ctx: Harness, from: object, to: object, note?: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/relations',
    headers: ctx.authed,
    payload: { from, to, ...(note ? { note } : {}) },
  })
}

describe('relations made by hand', () => {
  it('joins two things with a line of why, read from both ends', async () => {
    const { ctx, task, mira } = await setup()
    const res = await relate(
      ctx,
      { type: 'task', id: task },
      { type: 'person', id: mira.id },
      'Former colleague at Monzo',
    )
    expect(res.statusCode, res.body).toBe(201)
    const relation = res.json() as { id: string; origin: string; note: string }
    expect(relation.origin).toBe('manual')
    expect(relation.note).toBe('Former colleague at Monzo')

    const fromTask = itemsOf(await related(ctx, 'task', task), 'person')
    expect(fromTask).toMatchObject([
      {
        id: mira.id,
        title: 'Mira Chen',
        note: 'Former colleague at Monzo',
        outgoing: true,
        relationId: relation.id,
      },
    ])
    const fromMira = itemsOf(await related(ctx, 'person', mira.id), 'task')
    expect(fromMira).toMatchObject([
      { id: task, outgoing: false, note: 'Former colleague at Monzo' },
    ])

    // Both ends logged it.
    expect((await eventsOf(ctx, task)).map((e) => e.type)).toContain('relation_added')
  })

  it('asks no kind: relating twice answers with the one already there', async () => {
    const { ctx, task, mira } = await setup()
    const first = await relate(ctx, { type: 'task', id: task }, { type: 'person', id: mira.id })
    const again = await relate(
      ctx,
      { type: 'task', id: task },
      { type: 'person', id: mira.id },
      'later',
    )
    expect(again.statusCode).toBe(200)
    expect(again.json().id).toBe(first.json().id)
    expect(again.json().note).toBeNull()
  })

  it('can have its note changed and be removed', async () => {
    const { ctx, task, mira } = await setup()
    const { id } = (
      await relate(ctx, { type: 'task', id: task }, { type: 'person', id: mira.id })
    ).json()
    const noted = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/relations/${id}`,
      headers: ctx.authed,
      payload: { note: 'Can review the CV' },
    })
    expect(noted.statusCode, noted.body).toBe(200)
    expect(itemsOf(await related(ctx, 'person', mira.id), 'task')[0]?.note).toBe(
      'Can review the CV',
    )

    const gone = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/relations/${id}`,
      headers: ctx.authed,
    })
    expect(gone.statusCode).toBe(204)
    expect(itemsOf(await related(ctx, 'person', mira.id), 'task')).toEqual([])
    expect((await eventsOf(ctx, task)).map((e) => e.type)).toContain('relation_removed')
  })

  it('refuses a thing from another workspace, and a thing related to itself', async () => {
    const { ctx, task, mira } = await setup()
    const other = await secondUser(ctx)
    expect(
      (await relate(other, { type: 'task', id: task }, { type: 'person', id: mira.id })).statusCode,
    ).toBe(404)
    expect(
      (await relate(ctx, { type: 'task', id: task }, { type: 'task', id: task })).statusCode,
    ).toBe(400)
  })
})

describe('relations made by a mention', () => {
  const mention = (id: string) => `[@Mira Chen](ctws://person/${id})`

  it('appears on the mentioned thing with the sentence, and goes when the sentence does', async () => {
    const { ctx, task, mira } = await setup()
    const write = (notes: string | null) =>
      ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/tasks/${task}`,
        headers: ctx.authed,
        payload: { notes },
      })

    const written = await write(
      `Ask around. ${mention(mira.id)} said she can help with the CV. Then apply.`,
    )
    expect(written.statusCode, written.body).toBe(200)
    const onMira = itemsOf(await related(ctx, 'person', mira.id), 'task')
    expect(onMira).toMatchObject([
      {
        id: task,
        origin: 'mention',
        excerpt: `${mention(mira.id)} said she can help with the CV.`,
        outgoing: false,
      },
    ])

    // A mention is not removed by hand.
    const refused = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/v1/relations/${onMira[0]!.relationId}`,
      headers: ctx.authed,
    })
    expect(refused.statusCode).toBe(409)

    // Editing the sentence away removes it; editing another sentence leaves it.
    expect(
      (
        await write(
          `Ask around. ${mention(mira.id)} said she can help with the CV. Then apply early.`,
        )
      ).statusCode,
    ).toBe(200)
    expect(itemsOf(await related(ctx, 'person', mira.id), 'task')).toHaveLength(1)
    expect((await write('Ask around. Then apply.')).statusCode).toBe(200)
    expect(itemsOf(await related(ctx, 'person', mira.id), 'task')).toEqual([])
  })

  it("drops a mention of another account's thing, or of nothing, when read (TC-122)", async () => {
    const { ctx, task, mira } = await setup()
    const theirs = await secondUser(ctx, 'theirs@example.com')
    const stranger = await createPerson(theirs, { name: 'Nora Diaz' })
    const nobody = '99999999-9999-4999-8999-999999999999'
    const written = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${task}`,
      headers: ctx.authed,
      payload: {
        notes: `${mention(stranger.id)} is not mine. ${mention(nobody)} is nobody. ${mention(mira.id)} is.`,
      },
    })
    expect(written.statusCode, written.body).toBe(200)
    // The task's page names only what this account can see.
    const groups = await related(ctx, 'task', task)
    expect(groups.flatMap((g) => g.items.map((i) => i.id))).toEqual([mira.id])
    // The other account sees nothing of it on their person, and this one cannot ask about theirs.
    const onStranger = await theirs.app.inject({
      method: 'GET',
      url: `/api/v1/relations?type=person&id=${stranger.id}`,
      headers: theirs.authed,
    })
    expect(onStranger.statusCode).toBe(200)
    expect((onStranger.json() as RelationsResponse).groups).toEqual([])
    const asked = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/relations?type=person&id=${stranger.id}`,
      headers: ctx.authed,
    })
    expect(asked.statusCode).toBe(404)
  })

  it('is made on create too', async () => {
    const { ctx, projectId, mira } = await setup()
    const task = await createTask(ctx, projectId, 'Call', undefined, {
      notes: `Ring ${mention(mira.id)} today.`,
    })
    expect(itemsOf(await related(ctx, 'person', mira.id), 'task').map((t) => t.id)).toEqual([task])
  })
})
