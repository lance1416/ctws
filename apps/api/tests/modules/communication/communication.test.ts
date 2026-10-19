import type { AwaitingRow, CommunicationResponse, OrganisationInTouch } from '@ctws/contracts'
import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrganisation, createPerson, createProject } from '../../helpers/builders'
import { appWithUser, type Harness } from '../../helpers/harness'

/**
 * COMMUNICATION (FR-048, FR-070, FR-071, FR-079): exchanges logged by hand; a sent one may wait
 * for a reply by a day and surfaces on Today when the day comes; logging the reply closes it; the
 * overview says which organisations were in touch lately and what is next with each.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

// Thursday 2026-10-22 09:10 in London (acceptance-data.md).
const NOW = new Date('2026-10-22T08:10:00Z')

async function setup() {
  const ctx = await appWithUser('p@example.com', { clock: () => NOW })
  cleanups.push(ctx.stop)
  await ctx.db.execute(sql`update users set timezone = 'Europe/London'`)
  const harbour = await createOrganisation(ctx, { name: 'Harbour & Lane LLP', type: 'Law firm' })
  const sarah = await createPerson(ctx, { name: 'Sarah Whitfield' })
  await ctx.app.inject({
    method: 'PUT',
    url: `/api/v1/people/${sarah.id}/roles`,
    headers: ctx.authed,
    payload: { roles: [{ organisationId: harbour.id, title: 'Partner' }] },
  })
  const project = await createProject(ctx, 'Find a lawyer')
  return { ctx, harbour, sarah, project }
}

const log = (ctx: Harness, body: object) =>
  ctx.app.inject({
    method: 'POST',
    url: '/api/v1/communication',
    headers: ctx.authed,
    payload: body,
  })

async function view<T>(ctx: Harness, which: string): Promise<T> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/communication?view=${which}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as T
}

describe('logging an exchange', () => {
  it('names its parties, defaults to now, and shows on both their timelines', async () => {
    const { ctx, harbour, sarah, project } = await setup()
    const res = await log(ctx, {
      direction: 'sent',
      channel: 'email',
      parties: [
        { type: 'organisation', id: harbour.id },
        { type: 'person', id: sarah.id },
      ],
      subject: 'Initial enquiry',
      body: 'Could you take on a tenancy dispute?',
      projectId: project,
    })
    expect(res.statusCode, res.body).toBe(201)
    const sent = res.json() as CommunicationResponse
    expect(sent.occurredAt).toBe(NOW.toISOString())
    expect(sent.parties.map((p) => p.name).sort()).toEqual([
      'Harbour & Lane LLP',
      'Sarah Whitfield',
    ])
    expect(sent.projectName).toBe('Find a lawyer')
    expect(sent.awaitingReply).toBe(false)

    for (const [type, id] of [
      ['organisation', harbour.id],
      ['person', sarah.id],
      ['project', project],
    ]) {
      const tl = await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/timeline?type=${type}&id=${id}`,
        headers: ctx.authed,
      })
      const kinds = (tl.json() as { entries: { kind: string }[] }).entries.map((e) => e.kind)
      expect(kinds, type).toContain('message')
    }
  })

  it('refuses a received message that waits, and a party nobody can see', async () => {
    const { ctx, sarah } = await setup()
    const waits = await log(ctx, {
      direction: 'received',
      channel: 'email',
      parties: [{ type: 'person', id: sarah.id }],
      awaitingReply: true,
    })
    expect(waits.statusCode).toBe(400)
    const nobody = await log(ctx, {
      direction: 'sent',
      channel: 'email',
      parties: [{ type: 'person', id: '00000000-0000-7000-8000-000000000009' }],
    })
    expect(nobody.statusCode).toBe(404)
  })
})

describe('waiting for a reply', () => {
  it('follows up five days on by default, surfaces on the day, and closes when the reply is logged', async () => {
    const { ctx, sarah } = await setup()
    const sent = (
      await log(ctx, {
        direction: 'sent',
        channel: 'email',
        parties: [{ type: 'person', id: sarah.id }],
        subject: 'Fee estimate',
        awaitingReply: true,
      })
    ).json() as CommunicationResponse
    expect(sent.followUpOn).toBe('2026-10-27')

    // Not due yet: on the awaiting list, not on today's follow-ups.
    expect(
      (await view<{ awaiting: AwaitingRow[] }>(ctx, 'awaiting')).awaiting.map((r) => r.id),
    ).toEqual([sent.id])
    expect((await view<{ awaiting: AwaitingRow[] }>(ctx, 'followups')).awaiting).toEqual([])

    // "Later" moves the day; a day already past makes it due.
    const later = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/v1/communication/${sent.id}`,
      headers: ctx.authed,
      payload: { followUpOn: '2026-10-21' },
    })
    expect(later.statusCode, later.body).toBe(200)
    const due = (await view<{ awaiting: AwaitingRow[] }>(ctx, 'followups')).awaiting
    expect(due.map((r) => [r.id, r.waitingDays, r.daysToFollowUp])).toEqual([[sent.id, 0, -1]])

    const reply = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/communication/${sent.id}/reply`,
      headers: ctx.authed,
      payload: { body: 'Happy to help; see the attached estimate.' },
    })
    expect(reply.statusCode, reply.body).toBe(201)
    const received = reply.json() as CommunicationResponse
    expect([received.direction, received.subject, received.replyTo]).toEqual([
      'received',
      'Fee estimate',
      sent.id,
    ])
    expect(received.parties.map((p) => p.id)).toEqual([sarah.id])

    const closed = (
      await ctx.app.inject({
        method: 'GET',
        url: `/api/v1/communication/${sent.id}`,
        headers: ctx.authed,
      })
    ).json() as CommunicationResponse
    expect([closed.awaitingReply, closed.repliedBy]).toEqual([false, received.id])
    expect((await view<{ awaiting: AwaitingRow[] }>(ctx, 'awaiting')).awaiting).toEqual([])
    // A second reply has nothing to answer.
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: `/api/v1/communication/${sent.id}/reply`,
          headers: ctx.authed,
          payload: {},
        })
      ).statusCode,
    ).toBe(409)
  })
})

describe('the overview', () => {
  it('lists each organisation in touch once, with its last exchange and what is next', async () => {
    const { ctx, harbour, sarah } = await setup()
    const morrow = await createOrganisation(ctx, { name: 'Morrow Legal', type: 'Law firm' })
    const clifford = await createOrganisation(ctx, { name: 'Clifford Rowe LLP', type: 'Law firm' })

    // Harbour & Lane: two exchanges through Sarah (who works there), the latest waiting.
    await log(ctx, {
      direction: 'sent',
      channel: 'email',
      parties: [{ type: 'person', id: sarah.id }],
      subject: 'Enquiry',
      occurredAt: '2026-10-10T10:00:00Z',
    })
    await log(ctx, {
      direction: 'received',
      channel: 'email',
      parties: [{ type: 'person', id: sarah.id }],
      subject: 'Re: Enquiry',
      occurredAt: '2026-10-12T10:00:00Z',
    })
    await log(ctx, {
      direction: 'sent',
      channel: 'email',
      parties: [{ type: 'person', id: sarah.id }],
      subject: 'Engagement letter',
      occurredAt: '2026-10-20T10:00:00Z',
      awaitingReply: true,
      followUpOn: '2026-10-26',
    })
    // Morrow Legal: an enquiry nine days ago with no reply and no follow-up set.
    await log(ctx, {
      direction: 'sent',
      channel: 'email',
      parties: [{ type: 'organisation', id: morrow.id }],
      subject: 'Enquiry',
      occurredAt: '2026-10-13T10:00:00Z',
    })
    // Clifford Rowe: replied that they are not taking clients; nothing is next.
    await log(ctx, {
      direction: 'sent',
      channel: 'email',
      parties: [{ type: 'organisation', id: clifford.id }],
      subject: 'Enquiry',
      occurredAt: '2026-10-08T10:00:00Z',
    })
    await log(ctx, {
      direction: 'received',
      channel: 'email',
      parties: [{ type: 'organisation', id: clifford.id }],
      subject: 'Not taking new clients',
      occurredAt: '2026-10-09T10:00:00Z',
    })

    const overview = await view<{
      awaiting: AwaitingRow[]
      awaitingTotal: number
      inTouch: OrganisationInTouch[]
      inTouchTotal: number
    }>(ctx, 'overview')
    expect(overview.awaitingTotal).toBe(1)
    expect(overview.inTouchTotal).toBe(3)
    expect(
      overview.inTouch.map((o) => [o.organisationName, o.lastContact.subject, o.next]),
    ).toEqual([
      [
        'Harbour & Lane LLP',
        'Engagement letter',
        { kind: 'follow-up', on: '2026-10-26', late: false },
      ],
      ['Morrow Legal', 'Enquiry', { kind: 'no-reply', days: 9 }],
      ['Clifford Rowe LLP', 'Not taking new clients', { kind: 'nothing' }],
    ])
    expect(overview.inTouch[0]?.peopleCount).toBe(1)
    void harbour
  })
})
