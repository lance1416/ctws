import { expect, test, type Page } from '@playwright/test'
import {
  apiPost,
  makeProject,
  makeTask,
  projectActivityAt,
  registerFreshUser,
  WEB,
} from './helpers'
import { PHONE, undersized } from './targets'

/**
 * EVERY TARGET ON A PHONE IS 44, ON A FULL ACCOUNT (DES-001, FR-082), on the server pinned at
 * Thursday, October 22, 2026 (pinned.ts). An empty account hides most of what a finger meets: the
 * workbench's rows, a message waiting with its follow-up, a meeting with no notes yet, a role with
 * its months, last week's finished work. BUG-071 was 85 of those passing a sweep that never drew
 * them, so this one makes each kind of thing first, and then sweeps every page and layer.
 */
test.use({ viewport: PHONE, hasTouch: true, timezoneId: 'Europe/London' })

const H = (n: number) => String(n).padStart(2, '0')
const on = (day: string, hour = 10) => `${day}T${H(hour)}:00:00Z`

/** A thing of every kind the pages draw, as many as makes each kind of row appear. */
async function aFullAccount(page: Page) {
  const jh = await makeProject(page, 'Job hunt')
  const mf = await makeProject(page, 'Moving flat')
  const old = await makeProject(page, 'Old thesis')
  await page.request.patch(`/api/v1/projects/${old}`, { headers: WEB, data: { archived: true } })
  const { projects } = (await (
    await page.request.get('/api/v1/projects', { headers: WEB })
  ).json()) as {
    projects: { id: string; isInbox: boolean }[]
  }
  await makeTask(page, projects.find((p) => p.isInbox)!.id, 'Call the bank')

  // Today, Now and the next seven days; a parent to go into; last week's finished work.
  const amazon = await makeTask(page, jh, 'Amazon', { scheduledOn: '2026-10-22' })
  await makeTask(page, jh, 'Phone screen', { dueAt: on('2026-10-24', 12) }, amazon)
  for (const t of ['Prepare the system design round', 'Write the cover letter'])
    await makeTask(page, jh, t, { status: 'in_progress' })
  await makeTask(page, mf, 'Book the van', { dueAt: on('2026-10-25', 17) })
  const shipped = await makeTask(page, mf, 'Earlier work')
  for (const t of ['Pack the books', 'Cancel the broadband'])
    await makeTask(page, mf, t, { status: 'done' }, shipped)
  // The review reads the change log: last week's finishing is the log moved back into it.
  projectActivityAt(mf, on('2026-10-14'))

  // People in circles, with roles of known months, a birthday near, on a project.
  const stripe = await apiPost<{ id: string }>(page, '/organisations', { name: 'Stripe' })
  const mira = await apiPost<{ id: string }>(page, '/people', {
    givenName: 'Mira',
    familyName: 'Chen',
    circle: 'work',
    projectIds: [jh],
    birthday: { calendar: 'solar', month: 10, day: 29 },
    channels: [
      { kind: 'email', value: 'mira@example.com' },
      { kind: 'phone', value: '+44 20 7946 0000' },
    ],
  })
  await page.request.put(`/api/v1/people/${mira.id}/roles`, {
    headers: WEB,
    data: {
      roles: [
        { organisationId: stripe.id, title: 'Recruiter', from: '2024-01' },
        { organisationId: stripe.id, title: 'Sourcer', from: '2021-03', to: '2023-12' },
      ],
    },
  })
  // A task about the company puts it in the project, as its page and the overview say.
  await makeTask(page, jh, 'Stripe', {
    notes: `Apply to [@Stripe](ctws://organisation/${stripe.id}).`,
  })
  const priya = await apiPost<{ id: string }>(page, '/people', {
    givenName: 'Priya',
    familyName: 'Nair',
    circle: 'friend',
  })

  // A message waiting with its follow-up, one in from a company, both on the overview.
  const waiting = await apiPost<{ id: string }>(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    parties: [{ type: 'person', id: priya.id }],
    subject: 'Referral for the Stripe role',
    projectId: jh,
    occurredAt: on('2026-10-17'),
    awaitingReply: true,
    followUpOn: '2026-10-21',
  })
  await apiPost(page, '/communication', {
    direction: 'received',
    channel: 'email',
    parties: [{ type: 'organisation', id: stripe.id }],
    subject: 'Next steps',
    occurredAt: on('2026-10-20'),
  })

  // A meeting held with no notes, one ahead with a link, a series with notes on an earlier one.
  await apiPost(page, '/meetings', {
    title: 'Coffee with Priya',
    startsLocal: '2026-10-20T09:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    attendeeIds: [priya.id],
  })
  const screen = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: '2026-10-22T14:00',
    timeZone: 'Europe/London',
    durationMinutes: 45,
    joinUrl: 'https://meet.google.com/abc-defg-hij',
    projectId: jh,
    attendeeIds: [mira.id],
  })
  const sync = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Weekly sync',
    startsLocal: '2026-09-24T10:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    rrule: 'FREQ=WEEKLY;BYDAY=TH',
  })
  // A meeting with more people than are listed, folded behind "All N" (BUG-071).
  const crowd: string[] = []
  for (const n of ['Ada', 'Ben', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy'])
    crowd.push(
      (await apiPost<{ id: string }>(page, '/people', { givenName: n, familyName: 'Lee' })).id,
    )
  const crowded = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Atlas weekly',
    startsLocal: '2026-10-23T10:00',
    timeZone: 'Europe/London',
    durationMinutes: 45,
    attendeeIds: crowd,
  })
  await apiPost(page, '/notes', {
    body: 'The proc-macro server crashed again.',
    anchor: { type: 'meeting', id: sync.meetingId, occurrenceId: '2026-10-01T10:00' },
  })

  // Reading finished and dropped; one with who recommended it.
  const book = await apiPost<{ id: string }>(page, '/reading', { kind: 'book', title: 'Dune' })
  await page.request.patch(`/api/v1/reading/${book.id}`, {
    headers: WEB,
    data: { status: 'reading', recommendedBy: { type: 'person', id: mira.id } },
  })
  for (const [title, status] of [
    ['Shape Up', 'done'],
    ['Thinking in Systems', 'dropped'],
  ]) {
    const r = await apiPost<{ id: string }>(page, '/reading', { kind: 'book', title })
    await page.request.patch(`/api/v1/reading/${r.id}`, { headers: WEB, data: { status } })
  }

  // A note on a project, with a mention.
  const note = await apiPost<{ id: string }>(page, '/notes', {
    title: 'Questions for the onsite',
    body: `Ask [@Mira Chen](ctws://person/${mira.id}) which questions came up.`,
    anchor: { type: 'project', id: jh },
  })
  return {
    crowded: crowded.meetingId,
    jh,
    amazon,
    stripe: stripe.id,
    mira: mira.id,
    priya: priya.id,
    waiting: waiting.id,
    screen: screen.meetingId,
    sync: sync.meetingId,
    book: book.id,
    note: note.id,
  }
}

test('on a phone nothing that is pressed is under 44, on every page of a full account (DES-001)', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await registerFreshUser(page)
  const a = await aFullAccount(page)
  // What the sweep is for is there to sweep: a sweep of rows never drawn passes (BUG-071).
  await page.goto('/review')
  await expect(page.getByRole('main').getByText('Earlier work')).toBeVisible()
  await page.goto(`/organisations/${a.stripe}`)
  await expect(page.getByRole('region', { name: 'In projects' })).toBeVisible()
  const pages: [string, string][] = [
    ['Workbench', '/'],
    ['Today', '/today'],
    ['Calendar', '/calendar'],
    ['More', '/more'],
    ['People', '/people'],
    ['a person', `/people/${a.mira}`],
    ['another person', `/people/${a.priya}`],
    ['a person, edited', `/people/${a.mira}/edit`],
    ['New person', '/people/new'],
    ['Projects', '/projects'],
    ['a project', `/projects/${a.jh}`],
    ['a project, edited', `/projects/${a.jh}/edit`],
    ['Meetings', '/meetings'],
    ['a meeting', `/meetings/${a.screen}?at=2026-10-22T14:00`],
    ['a series', `/meetings/${a.sync}?at=2026-10-22T10:00`],
    ['a crowded meeting', `/meetings/${a.crowded}?at=2026-10-23T10:00`],
    ['a meeting, edited', `/meetings/${a.screen}/edit`],
    ['Organisations', '/organisations'],
    ['an organisation', `/organisations/${a.stripe}`],
    ['an organisation, edited', `/organisations/${a.stripe}/edit`],
    ['Communication', '/communication'],
    ['a message', `/communication/${a.waiting}`],
    ['Reading', '/reading'],
    ['a reading', `/reading/${a.book}`],
    ['a reading, edited', `/reading/${a.book}/edit`],
    ['Notes', '/notes'],
    ['a note', `/notes/${a.note}`],
    ['Review', '/review'],
    ['the weeks', '/review?list=weeks'],
    ['Done', '/review?view=done'],
    ['Account', '/account'],
    ['a task in the sheet', `/projects/${a.jh}?inspect=task:${a.amazon}`],
    ['a person in the sheet', `/projects/${a.jh}?inspect=person:${a.mira}`],
  ]
  const found: string[] = []
  const sweep = async (name: string) => {
    await page.waitForLoadState('networkidle')
    for (const s of await undersized(page)) found.push(`${name}: ${s}`)
  }
  for (const [name, url] of pages) {
    await page.goto(url)
    await expect(
      page
        .getByRole('heading', { level: 1 })
        .or(page.getByRole('complementary', { name: 'Inspector' }))
        .first(),
    ).toBeVisible()
    await sweep(name)
  }

  // The series' search goes under its name on a phone, never over it (BUG-074).
  await page.goto(`/meetings/${a.sync}?at=2026-10-22T10:00`)
  const earlier = page.getByRole('region', { name: 'Earlier in this series' })
  const heading = (await earlier
    .getByRole('heading', { name: 'Earlier in this series' })
    .boundingBox())!
  const search = (await earlier
    .getByRole('searchbox', { name: 'Search these notes' })
    .boundingBox())!
  expect(search.y).toBeGreaterThanOrEqual(heading.y + heading.height)

  // And what opens over a page.
  const sheet = page.getByRole('complementary', { name: 'Inspector' })
  const opened: [string, string, () => Promise<unknown>][] = [
    [
      'the capture sheet',
      '/today',
      () =>
        page
          .getByRole('navigation', { name: 'Main navigation' })
          .getByRole('button', { name: 'Capture' })
          .click(),
    ],
    [
      'a task edited in the sheet',
      `/projects/${a.jh}?inspect=task:${a.amazon}`,
      () => sheet.getByRole('button', { name: 'Edit', exact: true }).click(),
    ],
    [
      'Move to…',
      `/projects/${a.jh}?inspect=task:${a.amazon}`,
      async () => {
        await sheet.getByRole('button', { name: 'Edit', exact: true }).click()
        await sheet.getByRole('button', { name: /Move to…/ }).click()
      },
    ],
    [
      'Move to…’s second step',
      `/projects/${a.jh}?inspect=task:${a.amazon}`,
      async () => {
        await sheet.getByRole('button', { name: 'Edit', exact: true }).click()
        await sheet.getByRole('button', { name: /Move to…/ }).click()
        await page.getByRole('button', { name: 'Inside “Job hunt”' }).click()
      },
    ],
    [
      'New task',
      `/projects/${a.jh}`,
      async () => {
        await page.getByRole('button', { name: 'New', exact: true }).click()
        await page.getByRole('menuitem', { name: /^Task/ }).click()
      },
    ],
    [
      'search',
      '/more',
      async () => {
        await page.getByRole('button', { name: 'Search everything' }).click()
        await page.keyboard.type('stripe')
        await expect(page.getByRole('option').first()).toBeVisible()
      },
    ],
  ]
  for (const [name, url, open] of opened) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await open()
    await page.waitForTimeout(300)
    await sweep(name)
  }
  expect(found, 'targets under 44').toEqual([])
})
