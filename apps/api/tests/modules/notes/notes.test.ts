import type { NoteResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createMeeting, createPerson, createProject } from '../../helpers/builders'
import { appWithUser, type Harness } from '../../helpers/harness'

/**
 * NOTES (FR-050, FR-074): Markdown on its own or hung on a thing; a meeting's notes hang on the
 * meeting, one occurrence's on that occurrence; an @ in the body relates; the note shows on what
 * it hangs on.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

const write = (ctx: Harness, body: object) =>
  ctx.app.inject({ method: 'POST', url: '/api/v1/notes', headers: ctx.authed, payload: body })

async function timelineKinds(ctx: Harness, type: string, id: string): Promise<string[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/timeline?type=${type}&id=${id}`,
    headers: ctx.authed,
  })
  return (res.json() as { entries: { kind: string }[] }).entries.map((e) => e.kind)
}

describe('notes', () => {
  it('stand alone or hang on a thing, and show on its timeline', async () => {
    const ctx = await setup()
    const project = await createProject(ctx, 'rust-analyzer')
    const meeting = await createMeeting(ctx, {
      title: 'rust-analyzer sync',
      projectId: project,
      rrule: 'FREQ=WEEKLY',
    })

    const alone = await write(ctx, { title: 'Ideas', body: 'Nothing yet.' })
    expect(alone.statusCode, alone.body).toBe(201)
    expect((alone.json() as NoteResponse).anchor).toBeNull()

    const hung = await write(ctx, {
      body: '# Standing agenda\n\n- Open PRs\n- Flaky tests',
      anchor: { type: 'meeting', id: meeting.meetingId },
    })
    expect(hung.statusCode, hung.body).toBe(201)
    const note = hung.json() as NoteResponse
    expect(note.anchor).toEqual({
      type: 'meeting',
      id: meeting.meetingId,
      occurrenceId: null,
      title: 'rust-analyzer sync',
    })
    expect(note.words).toBe(6)

    const one = await write(ctx, {
      body: 'Decided to drop the flaky test.',
      anchor: { type: 'meeting', id: meeting.meetingId, occurrenceId: meeting.recurrenceId },
    })
    expect(one.statusCode, one.body).toBe(201)
    expect((one.json() as NoteResponse).anchor?.occurrenceId).toBe(meeting.recurrenceId)

    expect(await timelineKinds(ctx, 'meeting', meeting.meetingId)).toEqual([
      'note',
      'note',
      'change',
    ])
    const onMeeting = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/notes?anchor=meeting:${meeting.meetingId}`,
      headers: ctx.authed,
    })
    expect((onMeeting.json() as { notes: NoteResponse[] }).notes).toHaveLength(2)
  })

  it('refuse an occurrence on anything but a meeting, and an anchor nobody can see', async () => {
    const ctx = await setup()
    const person = await createPerson(ctx, { name: 'Mira Chen' })
    const wrong = await write(ctx, {
      body: 'x',
      anchor: { type: 'person', id: person.id, occurrenceId: '2026-10-20T10:00' },
    })
    expect(wrong.statusCode).toBe(400)
    const nobody = await write(ctx, {
      body: 'x',
      anchor: { type: 'person', id: '00000000-0000-7000-8000-000000000001' },
    })
    expect(nobody.statusCode).toBe(404)
    // Only a meeting, project, person or organisation carries notes (FR-050).
    const task = await write(ctx, { body: 'x', anchor: { type: 'task', id: person.id } })
    expect(task.statusCode).toBe(400)
  })

  it('relate what they mention, and log a body change once', async () => {
    const ctx = await setup()
    const mira = await createPerson(ctx, { name: 'Mira Chen' })
    const note = (
      await write(ctx, {
        body: `Ask [@Mira Chen](ctws://person/${mira.id}) about the payments team.`,
      })
    ).json() as NoteResponse
    const related = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/relations?type=person&id=${mira.id}`,
      headers: ctx.authed,
    })
    const notes = (
      related.json() as { groups: { type: string; items: { id: string; origin: string }[] }[] }
    ).groups.find((g) => g.type === 'note')
    expect(notes?.items.map((i) => [i.id, i.origin])).toEqual([[note.id, 'mention']])

    for (const body of ['Draft one.', 'Draft two.']) {
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${note.id}`,
        headers: ctx.authed,
        payload: { body },
      })
      expect(res.statusCode, res.body).toBe(200)
    }
    const kinds = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/timeline?type=note&id=${note.id}`,
      headers: ctx.authed,
    })
    // The mention's own relation events sit between; the body itself is logged once per save.
    const own = (kinds.json() as { entries: { event: { type: string } }[] }).entries
      .map((e) => e.event.type)
      .filter((t) => t === 'edited' || t === 'created')
    expect(own).toEqual(['edited', 'edited', 'created'])
    // The mention went with the sentence.
    const again = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/relations?type=person&id=${mira.id}`,
      headers: ctx.authed,
    })
    expect((again.json() as { groups: unknown[] }).groups).toEqual([])
  })
})
