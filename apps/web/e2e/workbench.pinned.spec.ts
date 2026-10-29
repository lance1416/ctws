import { expect, test, type Page } from '@playwright/test'
import {
  apiPost,
  makeProject,
  makeTask,
  openTaskPane,
  pickOne,
  registerFreshUser,
  serverTask,
  WEB,
} from './helpers'
import { PINNED_AT } from './pinned'

/**
 * THE WORKBENCH (FR-075 to FR-078, FR-028), on the server pinned at Thursday, October 22, 2026,
 * 00:30 UTC (01:30 in London): what is in hand, the launcher, the next meetings, who owes a reply,
 * birthdays, reading and the week, in a fixed arrangement where nothing scrolls.
 */
test.use({ timezoneId: 'Europe/London' })

/** The workbench of someone mid-search for a job: the "typical" data, the parts it shows. */
async function typical(page: Page) {
  const jh = await makeProject(page, 'Job hunt')
  const mf = await makeProject(page, 'Moving flat')
  for (const t of ['Prepare the system design round', 'Write the cover letter', 'Review the PR'])
    await makeTask(page, jh, t, { status: 'in_progress' })
  for (const t of ['Confirm the onsite date', 'Book the van']) await makeTask(page, mf, t)
  await makeTask(page, jh, 'CV draft', { dueAt: '2026-10-23T17:00:00Z' })
  const pin = async (project: string, url: string, name: string, pinnedRank: number) => {
    const r = await apiPost(page, '/resources', {
      owner: { type: 'project', id: project },
      url,
      name,
    })
    await page.request.patch(`/api/v1/resources/${r.id}`, { headers: WEB, data: { pinnedRank } })
  }
  await pin(jh, 'https://docs.google.com/document/d/cv/edit', 'CV master', 1)
  await pin(mf, 'https://docs.google.com/spreadsheets/d/budget', 'Budget', 1)
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  await apiPost(page, '/people', {
    givenName: 'Mira',
    familyName: 'Chen',
    birthday: { calendar: 'solar', month: 10, day: 29 },
  })
  await apiPost(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    parties: [{ type: 'person', id: priya.id }],
    subject: 'Onsite dates',
    occurredAt: '2026-10-17T10:00:00Z',
    awaitingReply: true,
    followUpOn: '2026-10-21',
  })
  await apiPost(page, '/meetings', {
    title: 'Stripe: first screen',
    startsLocal: '2026-10-22T14:00',
    timeZone: 'Europe/London',
    durationMinutes: 45,
    location: 'Google Meet',
    joinUrl: 'https://meet.google.com/abc-defg-hij',
  })
  const book = await apiPost(page, '/reading', {
    kind: 'book',
    title: 'Designing Data-Intensive Applications',
  })
  await page.request.patch(`/api/v1/reading/${book.id}`, {
    headers: WEB,
    data: { author: 'Martin Kleppmann', status: 'reading' },
  })
  return { jh, mf }
}

const place = (page: Page, name: string) => page.locator(`[data-place="${name}"]`)

/** The tab is shown again, as switching back to it does. */
const comeBack = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

test.describe('on a MacBook Air', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the first screen holds Now, the meetings, replies, the launcher and birthdays, and nothing scrolls', async ({
    page,
  }) => {
    await registerFreshUser(page)
    await typical(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Thursday, October 22')
    await expect(place(page, 'launcher').getByText('CV master')).toBeVisible()
    await expect(page.locator('[data-workbench-columns]')).toHaveAttribute(
      'data-workbench-columns',
      '3',
    )

    for (const name of ['now', 'meetings', 'awaiting', 'launcher', 'birthdays']) {
      const box = (await place(page, name).boundingBox())!
      expect(box.y + box.height, name).toBeLessThanOrEqual(900)
    }
    // The fourth row shows its heads, saying there is more below.
    const week = (await page.getByRole('heading', { name: 'Next seven days' }).boundingBox())!
    expect(week.y + week.height).toBeLessThanOrEqual(900)

    // No widget scrolls inside (FR-075).
    const scrolling = await page
      .locator('[data-place]')
      .evaluateAll((places) =>
        places.flatMap((p) =>
          [p, ...p.querySelectorAll('*')]
            .filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowY))
            .map((el) => el.className),
        ),
      )
    expect(scrolling).toEqual([])

    // What it shows, in its widgets.
    await expect(place(page, 'now')).toContainText('Prepare the system design round')
    await expect(place(page, 'now')).toContainText('Confirm the onsite date')
    await expect(place(page, 'awaiting')).toContainText('Onsite dates')
    await expect(place(page, 'awaiting')).toContainText('5 days')
    await expect(place(page, 'birthdays')).toContainText('Mira Chen')
    await expect(place(page, 'meetings')).toContainText('Stripe: first screen')
    await expect(place(page, 'meetings').getByRole('link', { name: 'Join' })).toHaveAttribute(
      'href',
      'https://meet.google.com/abc-defg-hij',
    )
  })

  test('the week shows deadlines, follow-ups and meetings on their days, today shaded', async ({
    page,
  }) => {
    await registerFreshUser(page)
    await typical(page)
    await page.goto('/')
    const day = (d: string) => page.locator(`[data-week-day="${d}"]`)
    await expect(day('2026-10-22').locator('[data-week-entry="occurrence"]')).toHaveText('14:00')
    await expect(day('2026-10-23').locator('[data-week-entry="due"]')).toHaveText('CV draft')
    await expect(page.locator('[data-week-day]')).toHaveCount(7)
    await page
      .getByRole('region', { name: 'Next seven days' })
      .getByRole('link', { name: 'Calendar' })
      .click()
    await expect(page).toHaveURL(/\/calendar$/)
  })

  test('Start and the tick move a task from Now’s lists', async ({ page }) => {
    await registerFreshUser(page)
    const { mf } = await typical(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start “Book the van”' }).click()
    await expect(place(page, 'now').locator('[data-now-working]')).toContainText(['Book the van'])
    expect((await serverTask(page, mf, 'Book the van')).status).toBe('in_progress')
  })
})

test.describe('on a 27-inch screen', () => {
  test.use({ viewport: { width: 2560, height: 1310 } })

  test('six columns in artboard 10’s arrangement; the widgets not built yet are their heads', async ({
    page,
  }) => {
    await registerFreshUser(page)
    await typical(page)
    await page.goto('/')
    await expect(page.locator('[data-workbench-columns]')).toHaveAttribute(
      'data-workbench-columns',
      '6',
    )
    const top = async (name: string) => (await place(page, name).boundingBox())!
    const now = await top('now')
    const launcher = await top('launcher')
    const meetings = await top('meetings')
    const weather = await top('weather')
    expect(now.x).toBeLessThan(launcher.x)
    expect(launcher.x).toBeLessThan(meetings.x)
    expect(meetings.x).toBeLessThan(weather.x)
    expect(new Set([now.y, launcher.y, meetings.y, weather.y]).size).toBe(1)
    // Everything fits: the page does not scroll.
    expect(await page.locator('main').evaluate((m) => m.scrollHeight <= m.clientHeight + 1)).toBe(
      true,
    )

    for (const name of ['Quick note', 'Weather', 'Music']) {
      const later = page.getByRole('region', { name })
      await expect(later).toContainText('Coming later')
      await expect(later.locator('button, a, input, textarea')).toHaveCount(0)
    }
    // No editing of the arrangement this round (FR-075).
    await expect(page.locator('main [draggable="true"]')).toHaveCount(0)
  })
})

test('a launcher link opens by its digit, in a new tab', async ({ page, baseURL }) => {
  await registerFreshUser(page)
  const p = await makeProject(page, 'Job hunt')
  for (const [i, path] of ['/first', '/second'].entries()) {
    const r = await apiPost(page, '/resources', {
      owner: { type: 'project', id: p },
      url: `${baseURL}${path}`,
      name: `Link ${i + 1}`,
    })
    await page.request.patch(`/api/v1/resources/${r.id}`, {
      headers: WEB,
      data: { pinnedRank: i + 1 },
    })
  }
  await page.goto('/')
  await expect(place(page, 'launcher').locator('[data-launcher]')).toHaveCount(2)
  const opened = page.context().waitForEvent('page')
  await page.keyboard.press('2')
  const tab = await opened
  await tab.waitForLoadState()
  expect(tab.url()).toBe(`${baseURL}/second`)
  await tab.close()
  // Opened from the launcher, it is offered back on Now.
  await expect(page.locator('[data-back-from]')).toContainText('Link 2')
})

test('pin a link from the launcher, on a project, at its first free digit', async ({ page }) => {
  await registerFreshUser(page)
  await makeProject(page, 'Moving flat')
  await page.goto('/')
  await place(page, 'launcher').getByRole('button', { name: 'Pin a link' }).click()
  const form = page.getByRole('dialog', { name: 'Pin a link' })
  await form
    .getByRole('textbox', { name: 'Address' })
    .fill('https://docs.google.com/spreadsheets/d/x')
  await form.getByRole('textbox', { name: 'Name (optional)' }).fill('Budget')
  await pickOne(form, 'Projects', 'Moving flat')
  await form.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(place(page, 'launcher').locator('[data-launcher="1"]')).toContainText('Budget')
})

test('N L hangs a link where you are: the inspector’s task, this project, or one picked', async ({
  page,
}) => {
  await registerFreshUser(page)
  const jh = await makeProject(page, 'Job hunt')
  await makeProject(page, 'Moving flat')
  const task = await makeTask(page, jh, 'Write the cover letter')
  const form = page.getByRole('dialog', { name: 'Pin a link' })
  const resources = async (type: string, id: string) =>
    (
      (await (
        await page.request.get(`/api/v1/resources?type=${type}&id=${id}`, { headers: WEB })
      ).json()) as { resources: { url: string; pinnedRank: number | null }[] }
    ).resources

  // A task in the inspector: added to its Resources.
  await page.goto(`/projects/${jh}?inspect=task:${task}`)
  await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible()
  await page.keyboard.press('n')
  await page.keyboard.press('l')
  await expect(form.locator('[data-pin-where]')).toHaveText('Adds to Write the cover letter')
  await form.getByRole('textbox', { name: 'Address' }).fill('https://github.com/x/y')
  await form.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect((await resources('task', task)).map((r) => r.url)).toEqual(['https://github.com/x/y'])

  // The project's page, nothing inspected: pinned in its head at the first free digit.
  await page.goto(`/projects/${jh}`)
  await expect(page.getByRole('heading', { name: 'Job hunt', level: 1 })).toBeVisible()
  await page.keyboard.press('n')
  await page.keyboard.press('l')
  await expect(form.locator('[data-pin-where]')).toContainText('Pins on')
  await expect(form.locator('[data-pin-where]')).toContainText('Job hunt')
  await form.getByRole('textbox', { name: 'Address' }).fill('https://docs.google.com/d/cv')
  // Esc keeps what was typed for the next N L (FR-029).
  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)
  await page.keyboard.press('n')
  await page.keyboard.press('l')
  await expect(form.getByRole('textbox', { name: 'Address' })).toHaveValue(
    'https://docs.google.com/d/cv',
  )
  await form.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(form).toHaveCount(0)
  expect((await resources('project', jh)).map((r) => r.pinnedRank)).toEqual([1])

  // Anywhere else: which project, asked.
  await page.goto('/people')
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.keyboard.press('n')
  await page.keyboard.press('l')
  await form.getByRole('textbox', { name: 'Address' }).fill('https://example.com/van')
  await expect(form.getByRole('button', { name: 'Pin', exact: true })).toBeDisabled()
  await pickOne(form, 'Projects', 'Moving flat')
  await form.getByRole('button', { name: 'Pin', exact: true }).click()
  await expect(form).toHaveCount(0)
})

test.describe('coming back from a resource (FR-028)', () => {
  /** Opens the task's resource from its pane, and comes back to the tab. */
  async function goAndComeBack(page: Page, name: string) {
    const opened = page.context().waitForEvent('page')
    await page.getByRole('link', { name }).click()
    await (await opened).close()
    await comeBack(page)
  }

  test('says where from and what for, and Mark done finishes the task', async ({
    page,
    baseURL,
  }) => {
    await registerFreshUser(page)
    const p = await makeProject(page, 'Job hunt')
    const task = await makeTask(page, p, 'Prepare the system design round', {
      status: 'in_progress',
    })
    for (const name of ['System design prep', 'Question bank'])
      await apiPost(page, '/resources', {
        owner: { type: 'task', id: task },
        url: `${baseURL}/${name.split(' ')[0]}`,
        name,
      })
    await openTaskPane(page, p, 'Prepare the system design round', false)

    await goAndComeBack(page, 'System design prep')
    const note = page.locator('[data-back-from-note]')
    await expect(note).toContainText('Back from')
    await expect(note).toContainText('System design prep')
    await expect(note).toContainText('Prepare the system design round')

    // Two opened one after the other: only the later is asked about.
    await goAndComeBack(page, 'Question bank')
    await expect(note).toContainText('Question bank')
    await expect(note).not.toContainText('System design prep')

    // Closing the note leaves the workbench's card.
    await note.getByRole('button', { name: 'Dismiss' }).click()
    await expect(note).toHaveCount(0)
    await page.goto('/')
    const card = page.locator('[data-back-from]')
    await expect(card).toContainText('Question bank')
    await expect(card).toContainText(/min ago|Just now/)

    await card.getByRole('button', { name: 'Mark done' }).click()
    await expect(card).toHaveCount(0)
    expect((await serverTask(page, p, 'Prepare the system design round')).status).toBe('done')
  })

  test('Still on it puts it away until a resource is opened again', async ({ page, baseURL }) => {
    await registerFreshUser(page)
    const p = await makeProject(page, 'Job hunt')
    const task = await makeTask(page, p, 'Write the cover letter', { status: 'in_progress' })
    await apiPost(page, '/resources', {
      owner: { type: 'task', id: task },
      url: `${baseURL}/letter`,
      name: 'Cover letter',
    })
    await openTaskPane(page, p, 'Write the cover letter', false)
    await goAndComeBack(page, 'Cover letter')
    await page.goto('/')
    const card = page.locator('[data-back-from]')
    await card.getByRole('button', { name: 'Still on it' }).click()
    await expect(card).toHaveCount(0)
    await page.reload()
    await expect(place(page, 'launcher')).toBeVisible()
    await expect(card).toHaveCount(0)
  })

  test('a resource opened more than a day ago is not asked about', async ({ page }) => {
    await registerFreshUser(page)
    const p = await makeProject(page, 'Job hunt')
    const task = await makeTask(page, p, 'Old task')
    const me = (await (await page.request.get('/api/v1/auth/me', { headers: WEB })).json()) as {
      id: string
    }
    await page.goto('/')
    await page.evaluate(({ key, away }) => localStorage.setItem(key, JSON.stringify(away)), {
      key: `ctws.away.${me.id}`,
      away: {
        url: 'https://example.com/old',
        name: 'Old link',
        from: { type: 'task', id: task, title: 'Old task', projectId: p },
        // The pinned clock's start, less a day and an hour.
        at: Date.parse(PINNED_AT) - 25 * 60 * 60 * 1000,
      },
    })
    await page.reload()
    await expect(place(page, 'launcher')).toBeVisible()
    await expect(page.locator('[data-back-from]')).toHaveCount(0)
  })
})
