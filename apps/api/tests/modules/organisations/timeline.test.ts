import type { TimelineEntry } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createOrganisation, createPerson } from '../../helpers/builders'
import { setupWith, type Harness } from '../../helpers/harness'

/**
 * AN ORGANISATION'S MESSAGES (FR-065): what was said with it, and with its people while they held
 * a role there; a message from before someone joined, or after they left, stays off it.
 */
const NOW = new Date('2026-10-21T11:00:00.000Z')

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

const setup = () => setupWith(cleanups, undefined, { clock: () => NOW, timezone: 'Europe/London' })

async function send(ctx: Harness, method: 'GET' | 'POST' | 'PUT', path: string, payload?: object) {
  const res = await ctx.app.inject({
    method,
    url: `/api/v1${path}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res.json()
}

const message = (ctx: Harness, subject: string, occurredAt: string, parties: object[]) =>
  send(ctx, 'POST', '/communication', {
    direction: 'sent',
    channel: 'email',
    occurredAt,
    parties,
    subject,
  })

describe("an organisation's timeline", () => {
  it('carries messages with it, and with its people while they were there', async () => {
    const ctx = await setup()
    const firm = await createOrganisation(ctx, { name: 'Harbour & Lane LLP' })
    const other = await createOrganisation(ctx, { name: 'Morrow Legal' })
    const sarah = await createPerson(ctx, { name: 'Sarah Whitfield' })
    // At the firm from March to August 2026, both months whole; at Morrow since September.
    await send(ctx, 'PUT', `/people/${sarah.id}/roles`, {
      roles: [
        { organisationId: firm.id, from: '2026-03', to: '2026-08' },
        { organisationId: other.id, from: '2026-09' },
      ],
    })
    const person = (id: string) => [{ type: 'person', id }]
    await message(ctx, 'Before she joined', '2026-02-27T09:00:00.000Z', person(sarah.id))
    await message(ctx, 'Her first month', '2026-03-01T09:00:00.000Z', person(sarah.id))
    await message(ctx, 'Her last month', '2026-08-31T09:00:00.000Z', person(sarah.id))
    await message(ctx, 'After she left', '2026-09-02T09:00:00.000Z', person(sarah.id))
    await message(ctx, 'To the firm', '2026-10-01T09:00:00.000Z', [
      { type: 'organisation', id: firm.id },
    ])

    const said = async (id: string) =>
      (
        (await send(ctx, 'GET', `/timeline?type=organisation&id=${id}&kinds=message`)) as {
          entries: TimelineEntry[]
        }
      ).entries.map((e) => (e.kind === 'message' ? e.message.subject : null))
    expect(await said(firm.id)).toEqual(['To the firm', 'Her last month', 'Her first month'])
    expect(await said(other.id)).toEqual(['After she left'])
  })
})
