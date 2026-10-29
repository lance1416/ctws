import { expect, test, type Page } from '@playwright/test'
import {
  accountZone,
  apiPost,
  dayInZone,
  makeProject,
  makeReading,
  makeTask,
  registerFreshUser,
  WEB,
} from './helpers'
import { addDays } from '@ctws/core/day'

/**
 * EVERY TARGET ON A PHONE IS 44 (DES-001 "触控区"): each page at 390, every button, link, tab,
 * radio and option that shows is measured. Words a finger reaches inside running text are the
 * one exception the rule makes, and they are named here.
 */
const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE, hasTouch: true })

/** What may be under 44: a link or a mention inside a note's own text. */
const INLINE = ['[data-note-md] *']

const TARGETS = 'button, a[href], [role=tab], [role=radio], [role=option]'

/** Every target on the page that shows and is under 44 either way, by its name and size. */
async function small(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ targets, inline }) => {
      const out: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>(targets)) {
        if (inline.some((s) => el.matches(s))) continue
        if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue
        if (el.closest('[aria-hidden="true"], .sr-only')) continue
        // A link stretched over its card by an `after:inset-0` is pressed as the card.
        const after = getComputedStyle(el, '::after')
        let hit: Element = el
        if (after.content !== 'none' && after.position === 'absolute') {
          for (let up = el.parentElement; up; up = up.parentElement)
            if (getComputedStyle(up).position !== 'static') {
              hit = up
              break
            }
        }
        const r = hit.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.width >= 43.5 && r.height >= 43.5) continue
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)
        out.push(
          `${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`,
        )
      }
      return out
    },
    { targets: TARGETS, inline: INLINE },
  )
}

test('on a phone nothing that is pressed is under 44, on any page (DES-001)', async ({ page }) => {
  test.setTimeout(120_000)
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const today = dayInZone(zone)
  const jh = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, jh, 'Amazon', { scheduledOn: today })
  await makeTask(page, jh, 'Phone screen', { dueAt: '2020-01-01T12:00:00.000Z' }, amazon)
  await makeTask(page, jh, 'Onsite', { status: 'done' }, amazon)
  const org = await apiPost<{ id: string }>(page, '/organisations', { name: 'Stripe' })
  const mira = await apiPost<{ id: string }>(page, '/people', {
    givenName: 'Mira',
    familyName: 'Chen',
    projectIds: [jh],
    channels: [
      { kind: 'email', value: 'mira@example.com' },
      { kind: 'phone', value: '+44 20 7946 0000' },
    ],
  })
  await page.request.put(`/api/v1/people/${mira.id}/roles`, {
    headers: WEB,
    data: { roles: [{ organisationId: org.id, title: 'Recruiter', from: '2024-01' }] },
  })
  const meeting = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: `${addDays(today, 1)}T14:00`,
    timeZone: zone,
    durationMinutes: 45,
    projectId: jh,
    attendeeIds: [mira.id],
  })
  const book = await makeReading(page, { kind: 'book', title: 'Dune' })
  const note = await apiPost<{ id: string }>(page, '/notes', {
    title: 'Questions',
    body: 'Ask about [the team](https://example.com/team) and the on-call.',
  })

  const pages: [string, string][] = [
    ['Today', '/today'],
    ['Calendar', '/calendar'],
    ['More', '/more'],
    ['People', '/people'],
    ['a person', `/people/${mira.id}`],
    ['a person, edited', `/people/${mira.id}/edit`],
    ['Projects', '/projects'],
    ['a project', `/projects/${jh}`],
    ['Meetings', '/meetings'],
    ['a meeting', `/meetings/${meeting.meetingId}`],
    ['Organisations', '/organisations'],
    ['an organisation', `/organisations/${org.id}`],
    ['an organisation, edited', `/organisations/${org.id}/edit`],
    ['Reading', '/reading'],
    ['a reading', `/reading/${book}`],
    ['a reading, edited', `/reading/${book}/edit`],
    ['Notes', '/notes'],
    ['a note', `/notes/${note.id}`],
    ['Communication', '/communication'],
    ['Review', '/review'],
    ['Account', '/account'],
    ['a task in the sheet', `/projects/${jh}?inspect=task:${amazon}`],
    ['a person in the sheet', `/projects/${jh}?inspect=person:${mira.id}`],
  ]
  const found: string[] = []
  for (const [name, url] of pages) {
    await page.goto(url)
    await expect(
      page
        .getByRole('heading', { level: 1 })
        .or(page.getByRole('complementary', { name: 'Inspector' }))
        .first(),
    ).toBeVisible()
    await page.waitForLoadState('networkidle')
    for (const s of await small(page)) found.push(`${name}: ${s}`)
  }
  // And what opens over a page.
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
      `/projects/${jh}?inspect=task:${amazon}`,
      () =>
        page
          .getByRole('complementary', { name: 'Inspector' })
          .getByRole('button', { name: 'Edit', exact: true })
          .click(),
    ],
    [
      'New task',
      `/projects/${jh}`,
      async () => {
        await page.getByRole('button', { name: 'New', exact: true }).click()
        await page.getByRole('menuitem', { name: /^Task/ }).click()
      },
    ],
  ]
  for (const [name, url, open] of opened) {
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await open()
    await page.waitForTimeout(300)
    for (const s of await small(page)) found.push(`${name}: ${s}`)
  }
  expect(found, 'targets under 44').toEqual([])
})
