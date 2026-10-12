import { expect, test, type Page } from '@playwright/test'
import { accountZone, makeProject, makeTask, meetingToday, registerFreshUser, WEB } from './helpers'

/**
 * THE WORKBENCH -- THE SHELL'S OWN FRONT PAGE.
 *
 * The claim under test is not that the page renders: it is that the page belongs to NOBODY, and
 * that its cards and the project pages do not show each other's rows. A workbench card that
 * repeated what is already on a project page would make two places to keep in your head.
 */

const card = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

test('signing in lands on the workbench, not inside a module', async ({ page }) => {
  await registerFreshUser(page, '/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Workbench', level: 1 })).toBeVisible()
  // Every module has a card here, and the shell has its own.
  await expect(card(page, 'Today')).toBeVisible()
  await expect(card(page, 'Reading')).toBeVisible()
  await expect(card(page, 'Projects')).toBeVisible()
})

test('the Reading card holds only what belongs to no project', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'CTWS')
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '散着的书' },
  })
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '归了项目的书', projectId: pid },
  })
  await page.goto('/')

  const reading = card(page, 'Reading')
  await expect(reading).toContainText('散着的书')
  // THE DIVISION OF LABOUR: what is filed under a project lives on that project's page, and this
  // card does not repeat it.
  await expect(reading).not.toContainText('归了项目的书')

  await page.goto(`/projects/${pid}`)
  await expect(page.getByText('归了项目的书')).toBeVisible()
  await expect(page.getByText('散着的书')).toHaveCount(0)
})

test('an item whose project was deleted turns up on the card rather than nowhere', async ({
  page,
}) => {
  // Projects are soft-deleted, so without this the item would be absent from every project page
  // AND from the card -- in the database and on no screen.
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, '要删掉的')
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '留下来的书', projectId: pid },
  })
  await page.request.delete(`/api/v1/projects/${pid}`, { headers: WEB })
  await page.goto('/')
  await expect(card(page, 'Reading')).toContainText('留下来的书')
})

test('the Today card shows what is in progress, across projects', async ({ page }) => {
  await registerFreshUser(page, '/')
  const a = await makeProject(page, 'CTWS')
  const b = await makeProject(page, 'rrgen')
  const task = async (projectId: string, title: string, status?: string) => {
    const res = await page.request.post('/api/v1/tasks', {
      headers: WEB,
      data: { projectId, title, parentId: null },
    })
    const { id } = (await res.json()) as { id: string }
    if (status) await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: { status } })
  }
  await task(a, '配色重做', 'in_progress')
  await task(b, '跑通 CI', 'in_progress')
  await task(a, '还没开始的')
  await page.goto('/')

  const doing = card(page, 'Today')
  await expect(doing).toContainText('配色重做')
  await expect(doing).toContainText('跑通 CI')
  await expect(doing).not.toContainText('还没开始的')
})

test('g w goes to the workbench, and it is the shell own key', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('t')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await page.keyboard.press('g')
  await page.keyboard.press('w')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Workbench', level: 1 })).toBeVisible()
})

// ------------------------------------------------------------------------- each card its shape

test('the cards are Today, Meetings, Reading, Birthdays and Projects, each heading its page', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const cards = page.getByRole('main').locator('[data-panel]')
  await expect(cards).toHaveCount(5)
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-panel')))).toEqual([
    'Today',
    'Meetings',
    'Reading',
    'Birthdays',
    'Projects',
  ])
  // A card's heading is the way to its page; there is no separate "See all".
  for (const [name, to] of [
    ['Today', '/tasks/today'],
    ['Meetings', '/meetings'],
    ['Reading', '/reading'],
    ['Birthdays', '/people/birthdays'],
    ['Projects', '/projects'],
  ] as const)
    await expect(card(page, name).getByRole('heading').getByRole('link')).toHaveAttribute(
      'href',
      to,
    )
  await expect(page.getByRole('main').getByText('See all')).toHaveCount(0)
})

test('the Today card counts what is late, planned and done, and each count goes there', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '晚了的', { dueAt: '2020-01-01T09:00:00.000Z' })
  await makeTask(page, pid, '今天的', { scheduledOn: new Date().toLocaleDateString('en-CA') })
  await makeTask(page, pid, '做完的', { status: 'done' })
  await page.goto('/')
  const today = card(page, 'Today')
  await expect(today.getByRole('link', { name: '1 overdue' })).toHaveAttribute(
    'href',
    '/tasks/today',
  )
  await expect(today.getByRole('link', { name: '1 planned' })).toHaveAttribute(
    'href',
    '/tasks/today',
  )
  await expect(today.getByRole('link', { name: '1 done' })).toHaveAttribute(
    'href',
    '/tasks/completed',
  )
})

test('the Meetings line names each meeting and what time it is now', async ({ page }) => {
  await registerFreshUser(page, '/')
  await meetingToday(page, 'Northwind intro call', '12:00', await accountZone(page))
  await page.goto('/')
  const line = card(page, 'Meetings').getByRole('img')
  await expect(line).toHaveAttribute('aria-label', /Northwind intro call at 12:00/)
  await expect(line).toHaveAttribute('aria-label', /It is \d{2}:\d{2}\./)
})

test('a meeting outside the line’s hours is listed under it, not dropped', async ({ page }) => {
  await registerFreshUser(page, '/')
  // 06:30 is before the line's 08:00, on the account's own clock, whatever day this runs.
  await meetingToday(page, 'Early standup', '06:30', await accountZone(page))
  await page.goto('/')
  const meetings = card(page, 'Meetings')
  await expect(meetings.getByRole('listitem').filter({ hasText: 'Early standup' })).toHaveCount(1)
  await expect(meetings.getByRole('img')).toHaveAttribute('aria-label', /Early standup at 06:30/)
})

test('a project line says what is open, what is late or due next, and when it moved', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const late = await makeProject(page, '晚了的线')
  await makeTask(page, late, '一', { dueAt: '2020-01-01T09:00:00.000Z' })
  await makeTask(page, late, '二')
  const next = await makeProject(page, '有下一个的线')
  await makeTask(page, next, '三', { dueAt: '2099-03-04T09:00:00.000Z' })
  await page.goto('/')
  const line = (name: string) =>
    card(page, 'Projects').getByRole('listitem').filter({ hasText: name })
  await expect(line('晚了的线')).toContainText('2 open')
  await expect(line('晚了的线')).toContainText('1 overdue')
  await expect(line('晚了的线')).toContainText('Moved today')
  await expect(line('有下一个的线')).toContainText('1 open')
  await expect(line('有下一个的线')).toContainText('Due Mar 4, 2099')
})
