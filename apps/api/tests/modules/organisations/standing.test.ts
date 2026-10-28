import type {
  CommunicationOverviewResponse,
  OrganisationResponse,
  StageResponse,
} from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrganisation, createProject, createTask } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * WHERE AN ORGANISATION STANDS (FR-064, FR-065, FR-071): the projects it is in through a node
 * related to it, with that node's stage, on its page and in "Organisations in touch". The clock
 * is pinned: Wednesday 21 October 2026, noon in London.
 */
const NOW = new Date('2026-10-21T11:00:00.000Z')

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const setup = () => setupWith(cleanups, undefined, { clock: () => NOW, timezone: 'Europe/London' })

async function send(
  ctx: Harness,
  path: string,
  payload?: object,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
) {
  const res = await ctx.app.inject({
    method,
    url: `/api/v1${path}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res.statusCode === 204 ? null : res.json()
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

describe('an organisation in projects', () => {
  it('names each project once, at the stage of the node related to it, staged ones first', async () => {
    const ctx = await setup()
    const lawyer = await createProject(ctx, 'Find a lawyer')
    const jobs = await createProject(ctx, 'Job hunt')
    const quiet = await createProject(ctx, 'Quiet')
    const stage = await stagesOf(ctx, lawyer, ['Contacted', 'Shortlisted'])
    const harbour = await createOrganisation(ctx, { name: 'Harbour & Lane LLP' })
    const node = await createTask(ctx, lawyer, 'Harbour & Lane', undefined, {
      stageId: stage.get('Shortlisted')!,
    })
    // A second node in the same project, at no stage: the staged one speaks for the project.
    const call = await createTask(ctx, lawyer, 'Call them back')
    const referral = await createTask(ctx, jobs, 'Ask about a referral')
    const gone = await createTask(ctx, quiet, 'Gone')
    await relate(ctx, { type: 'task', id: node }, { type: 'organisation', id: harbour.id })
    await relate(ctx, { type: 'organisation', id: harbour.id }, { type: 'task', id: call })
    await relate(ctx, { type: 'task', id: referral }, { type: 'organisation', id: harbour.id })
    await relate(ctx, { type: 'task', id: gone }, { type: 'organisation', id: harbour.id })
    await send(ctx, `/tasks/${gone}`, undefined, 'DELETE')

    const page = (await send(
      ctx,
      `/organisations/${harbour.id}`,
      undefined,
      'GET',
    )) as OrganisationResponse
    expect(page.inProjects).toEqual([
      { projectId: lawyer, projectName: 'Find a lawyer', stage: 'Shortlisted' },
      { projectId: jobs, projectName: 'Job hunt', stage: null },
    ])
  })

  it('is said beside the organisation in "Organisations in touch"', async () => {
    const ctx = await setup()
    const lawyer = await createProject(ctx, 'Find a lawyer')
    const stage = await stagesOf(ctx, lawyer, ['Contacted'])
    const morrow = await createOrganisation(ctx, { name: 'Morrow Legal' })
    const clifford = await createOrganisation(ctx, { name: 'Clifford Rowe LLP' })
    const node = await createTask(ctx, lawyer, 'Morrow Legal', undefined, {
      stageId: stage.get('Contacted')!,
    })
    await relate(ctx, { type: 'task', id: node }, { type: 'organisation', id: morrow.id })
    for (const o of [morrow, clifford])
      await send(ctx, '/communication', {
        direction: 'sent',
        channel: 'email',
        occurredAt: '2026-10-12T09:00:00.000Z',
        parties: [{ type: 'organisation', id: o.id }],
        subject: 'Enquiry',
      })

    const overview = (await send(
      ctx,
      '/communication?view=overview',
      undefined,
      'GET',
    )) as CommunicationOverviewResponse
    const byName = new Map(overview.inTouch.map((t) => [t.organisationName, t.standing]))
    expect(byName.get('Morrow Legal')).toEqual({
      projectId: lawyer,
      projectName: 'Find a lawyer',
      stage: 'Contacted',
    })
    expect(byName.get('Clifford Rowe LLP')).toBeNull()
  })
})
