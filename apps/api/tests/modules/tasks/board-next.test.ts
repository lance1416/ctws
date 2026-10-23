import type { StageResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createMeeting,
  createOrganisation,
  createPerson,
  createProject,
  createTask,
} from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * WHAT COMES NEXT ON THE BOARD BY STAGE (FR-058): with the project's tasks, the next meeting and
 * the soonest follow-up about each node with a stage, the nodes above it and their organisations.
 * The clock is pinned: Wednesday 21 October 2026, noon in London.
 */
const NOW = new Date('2026-10-21T11:00:00.000Z')

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const setup = () => setupWith(cleanups, undefined, { clock: () => NOW, timezone: 'Europe/London' })

async function send(ctx: Harness, path: string, payload: object, method: 'POST' | 'PUT' = 'POST') {
  const res = await ctx.app.inject({ method, url: `/api/v1${path}`, headers: ctx.authed, payload })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res.json()
}

const relate = (ctx: Harness, from: object, to: object) => send(ctx, '/relations', { from, to })

async function stagesOf(ctx: Harness, projectId: string, names: string[]) {
  const { stages } = (await send(
    ctx,
    `/projects/${projectId}/stages`,
    { stages: names.map((name) => ({ name })) },
    'PUT',
  )) as { stages: StageResponse[] }
  return new Map(stages.map((s) => [s.name, s.id]))
}

/** A sent email to `parties`, waiting for a reply by `on`, filed under `projectId` if given. */
const awaiting = async (ctx: Harness, parties: object[], on: string, projectId?: string) =>
  (
    (await send(ctx, '/communication', {
      direction: 'sent',
      channel: 'email',
      occurredAt: '2026-10-19T09:00:00.000Z',
      parties,
      awaitingReply: true,
      followUpOn: on,
      ...(projectId ? { projectId } : {}),
    })) as { id: string }
  ).id

describe('GET /tasks?projectId: next', () => {
  it('names the next meeting and the soonest follow-up about the cards and their organisations', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'Job hunt')
    const stage = await stagesOf(ctx, p, ['Phone screen', 'Onsite'])
    const stripe = await createTask(ctx, p, 'Stripe', undefined, {
      stageId: stage.get('Phone screen')!,
    })
    const amazon = await createTask(ctx, p, 'Amazon')
    const sde = await createTask(ctx, p, 'SDE II', amazon, { stageId: stage.get('Onsite')! })
    const cv = await createTask(ctx, p, 'Update the CV')
    const st = await createOrganisation(ctx, { name: 'Stripe' })
    await relate(ctx, { type: 'task', id: stripe }, { type: 'organisation', id: st.id })

    // Mira works at Stripe now; Leo did until last year.
    const mira = await createPerson(ctx, { name: 'Mira' })
    await send(ctx, `/people/${mira.id}/roles`, { roles: [{ organisationId: st.id }] }, 'PUT')
    const leo = await createPerson(ctx, { name: 'Leo' })
    await send(
      ctx,
      `/people/${leo.id}/roles`,
      { roles: [{ organisationId: st.id, from: '2023-01', to: '2025-06' }] },
      'PUT',
    )

    // Stripe's, through Mira and in this project: one already over and the first screen tomorrow.
    // Leo's is not Stripe's; Mira's sync in another project is not this card's (FR-058).
    await createMeeting(ctx, {
      title: 'Intro call',
      startsLocal: '2026-10-20T10:00',
      attendeeIds: [mira.id],
      projectId: p,
    })
    const screen = await createMeeting(ctx, {
      title: 'First screen',
      startsLocal: '2026-10-22T14:00',
      attendeeIds: [mira.id],
      projectId: p,
    })
    await createMeeting(ctx, {
      title: 'rust-analyzer sync',
      startsLocal: '2026-10-21T16:00',
      attendeeIds: [mira.id],
      projectId: await createProject(ctx, 'rust-analyzer'),
    })
    await createMeeting(ctx, {
      title: 'Coffee',
      startsLocal: '2026-10-21T15:00',
      attendeeIds: [leo.id],
    })
    // The role: a weekly sync related to it outright, the next one Monday.
    const sync = await createMeeting(ctx, {
      title: 'Recruiter sync',
      startsLocal: '2026-10-05T10:00',
      rrule: 'FREQ=WEEKLY',
    })
    await relate(ctx, { type: 'meeting', id: sync.meetingId }, { type: 'task', id: sde })
    // Nothing on the board is about the CV.
    const cvTalk = await createMeeting(ctx, { title: 'CV review', startsLocal: '2026-10-21T16:00' })
    await relate(ctx, { type: 'task', id: cv }, { type: 'meeting', id: cvTalk.meetingId })

    // Stripe's follow-ups: through Mira on Friday, in this project; to the company itself on
    // Sunday, filed nowhere. Through Mira but filed nowhere, Thursday's is not this card's.
    const toMira = await awaiting(ctx, [{ type: 'person', id: mira.id }], '2026-10-23', p)
    await awaiting(ctx, [{ type: 'organisation', id: st.id }], '2026-10-25')
    await awaiting(ctx, [{ type: 'person', id: mira.id }], '2026-10-22')
    // The company above the role: one related to it, its day already past.
    const late = await awaiting(ctx, [{ type: 'person', id: leo.id }], '2026-10-20')
    await relate(ctx, { type: 'communication', id: late }, { type: 'task', id: amazon })

    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks?projectId=${p}`,
      headers: ctx.authed,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().next).toEqual({
      [st.id]: {
        meeting: {
          id: screen.meetingId,
          title: 'First screen',
          startsAt: '2026-10-22T14:00:00.000Z',
        },
        followUp: { id: toMira, on: '2026-10-23' },
      },
      [sde]: {
        meeting: {
          id: sync.meetingId,
          title: 'Recruiter sync',
          startsAt: '2026-10-26T10:00:00.000Z',
        },
      },
      [amazon]: { followUp: { id: late, on: '2026-10-20' } },
    })
  })

  it('is empty when nothing has a stage', async () => {
    const ctx = await setup()
    const p = await createProject(ctx, 'CTWS')
    const t = await createTask(ctx, p, 'Ship it')
    const talk = await createMeeting(ctx, { title: 'Demo', startsLocal: '2026-10-22T10:00' })
    await relate(ctx, { type: 'task', id: t }, { type: 'meeting', id: talk.meetingId })
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/tasks?projectId=${p}`,
      headers: ctx.authed,
    })
    expect(res.json().next).toEqual({})
  })
})
