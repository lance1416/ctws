import { expect, test, type Page } from '@playwright/test'
import {
  accountZone,
  apiPost,
  dayInZone,
  makeProject,
  makeTask,
  registerFreshUser,
  WEB,
} from './helpers'
import { addDays } from '@ctws/core/day'

/**
 * THE PHONE (FR-082 to FR-085, artboard 25): the tab bar's capture sheet, Today in sections with
 * its swipes, and More. At 390, the artboards' width.
 */
const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE, hasTouch: true })

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })

const serverTasks = async (page: Page, projectId: string) =>
  (
    (await (
      await page.request.get(`/api/v1/tasks?projectId=${projectId}`, { headers: WEB })
    ).json()) as {
      tasks: {
        id: string
        title: string
        parentId: string | null
        status: string
        scheduledOn: string | null
      }[]
    }
  ).tasks

test('the capture sheet: a link turns it to Reading, Add keeps it open and empty (FR-084)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await tabs(page).getByRole('button', { name: 'Capture' }).click()
  const sheet = page.getByRole('dialog', { name: 'Capture' })
  const box = sheet.getByRole('textbox', { name: 'Capture' })
  await expect(box).toBeFocused()

  await box.fill('https://martinfowler.com/articles/patterns')
  await expect(sheet.getByRole('radio', { name: 'Reading' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  // Event is a placeholder: pressed, it only says so.
  await sheet.getByRole('radio', { name: 'Event' }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'Coming later' })).toBeVisible()

  await box.fill('Call the letting agent')
  await expect(sheet.getByRole('radio', { name: 'Task' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'Added to' })).toBeVisible()
  await expect(box).toHaveValue('')
  await expect(sheet).toBeVisible()
})

test('Lands in is Move to…, Inbox first, and a project’s parents a step in (FR-084)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const jh = await makeProject(page, 'Job hunt')
  const amazon = await makeTask(page, jh, 'Amazon')
  await makeTask(page, jh, 'Phone screen', {}, amazon)
  await page.reload()
  await tabs(page).getByRole('button', { name: 'Capture' }).click()
  const sheet = page.getByRole('dialog', { name: 'Capture' })
  await sheet.getByRole('textbox', { name: 'Capture' }).fill('Ask about the team')

  await sheet.getByRole('button', { name: /^Lands in/ }).click()
  const picker = page.getByRole('dialog', { name: 'Lands in' })
  await expect(picker.getByRole('option').first()).toContainText('Inbox')
  await picker.getByRole('button', { name: 'Inside “Job hunt”' }).click()
  await picker.getByRole('option', { name: /Amazon/ }).click()
  await expect(sheet.getByRole('button', { name: 'Lands in Job hunt, under Amazon' })).toBeVisible()

  await sheet.getByRole('button', { name: 'No date' }).click()
  const day = page.getByRole('dialog', { name: 'Day' })
  const today = dayInZone(await accountZone(page))
  await day.getByRole('button', { name: today, exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'On Today' })).toBeVisible()

  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'Added to' })).toBeVisible()
  const made = (await serverTasks(page, jh)).find((t) => t.title === 'Ask about the team')!
  expect([made.parentId, made.scheduledOn]).toEqual([amazon, today])
})

test('Today on a phone: sections, the circle finishes, the swipes move and finish (FR-083)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const today = dayInZone(await accountZone(page))
  const p = await makeProject(page, 'Moving flat')
  for (const title of ['Measure the room', 'Book the van', 'Pack the books', 'Call the agent'])
    await makeTask(page, p, title, { scheduledOn: today })
  await makeTask(page, p, 'Return the keys', { dueAt: `${addDays(today, -3)}T12:00:00.000Z` })
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible()
  const planned = page.getByRole('region', { name: 'Planned for today' })
  await expect(planned.locator('[data-phone-row]')).toHaveCount(4)
  await expect(page.getByRole('region', { name: 'Overdue' })).toContainText('3 days late')
  // Nothing of the desk's: no timeline, no Ready to start.
  await expect(page.getByRole('region', { name: 'Ready to start' })).toHaveCount(0)

  // The circle, at least 44 to touch, finishes it.
  const circle = planned.getByRole('button', { name: 'Done “Measure the room”' })
  expect((await circle.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await circle.click()
  await expect(planned.getByText('Measure the room')).toHaveCount(0)

  // Swiped left: Tomorrow takes it off today.
  const swipe = async (title: string, by: number) => {
    const row = page.locator('[data-phone-row]').filter({ hasText: title }).locator('.touch-pan-y')
    const b = (await row.boundingBox())!
    const y = b.y + b.height / 2
    const from = by < 0 ? b.x + b.width - 40 : b.x + 60
    await page.mouse.move(from, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(from + (by * i) / 10, y)
    await page.mouse.up()
  }
  await swipe('Book the van', -200)
  await planned.getByRole('button', { name: 'Move “Book the van” to tomorrow' }).click()
  await expect(planned.getByText('Book the van')).toHaveCount(0)
  expect((await serverTasks(page, p)).find((t) => t.title === 'Book the van')!.scheduledOn).toBe(
    addDays(today, 1),
  )

  // Pick a date: the shared grid from the foot; a day not today takes it off.
  await swipe('Pack the books', -200)
  await planned.getByRole('button', { name: 'Pick a date for “Pack the books”' }).click()
  const sheet = page.getByRole('dialog', { name: 'Move “Pack the books” to' })
  await sheet.getByRole('button', { name: 'Next month' }).click()
  await sheet.getByRole('button', { name: /-15$/ }).first().click()
  await expect(planned.getByText('Pack the books')).toHaveCount(0)

  // Swiped right: done.
  await swipe('Call the agent', 160)
  await expect(planned).toHaveCount(0)
  expect((await serverTasks(page, p)).find((t) => t.title === 'Call the agent')!.status).toBe(
    'done',
  )
})

test('More: search on top, the pages, every other kind, the projects, the account (FR-085)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const p = await makeProject(page, 'Moving flat')
  await makeTask(page, p, 'Book the van')
  await makeTask(page, p, 'Pack')
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  await apiPost(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    subject: 'Referral',
    parties: [{ type: 'person', id: priya.id as string }],
    awaitingReply: true,
  })
  await tabs(page).getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  const main = page.getByRole('main')
  await expect(main.getByRole('region', { name: 'Pages' }).getByRole('link')).toHaveText([
    /^Workbench/,
    /^Review/,
  ])
  const kinds = main.getByRole('region', { name: 'Everything else' }).getByRole('link')
  await expect(kinds).toHaveText([
    /^Projects/,
    /^Organisations/,
    /^Meetings/,
    /^Communication\s*Awaiting\s*1/,
    /^Reading/,
    /^Notes/,
  ])
  await expect(main.getByRole('region', { name: 'Projects' }).getByRole('link')).toHaveText([
    /^MF\s*Moving flat\s*2/,
  ])
  await main.getByRole('button', { name: 'Search everything' }).click()
  await expect(page.getByRole('dialog', { name: 'Search everything' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await main.getByRole('link', { name: 'Account and time zone' }).click()
  await expect(page).toHaveURL(/\/account$/)
})
