import { expect, test, type Page } from '@playwright/test'
import {
  editDetail,
  makeProject,
  makeTask,
  openProject,
  patchAnswered,
  pickOne,
  registerFreshUser,
  routeMoves,
  setDetailStatus,
  submitCreate,
  navLink,
  setDue,
} from './helpers'
import { addDaysYmd, dayOffset } from './days'

const PATCH_URL = /\/tasks\/[^/]+$/

/** A plan on a fixed day in a past year: said with its year whenever the suite runs. */
const PLAN = '2019-03-14'
const PLAN_SAID = 'Mar 14, 2019'
/** A deadline a few days ahead, so it does not read as overdue. */
const DUE = dayOffset(3)

/** Clicks Save and resolves once the server has accepted the request, i.e. it is persisted. */
async function save(page: Page, url: RegExp = PATCH_URL) {
  const done = page.waitForResponse((r) => url.test(r.url()) && r.request().method() !== 'GET')
  await page.getByRole('button', { name: 'Save' }).click()
  const res = await done
  expect(res.ok()).toBe(true)
  // A save lands the pane back in READING mode -- or takes the task off this page entirely, which
  // unmounts the pane. Until then the form is still dirty, so anything that tries to leave meets
  // the discard prompt instead.
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0)
  return res
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

/**
 * Leaves the detail pane if one is open.
 *
 * It PRESSES THE ✕ rather than Escape: Escape is handled on the panel element, so it only works
 * while focus is inside, and right after a save focus is still on its way back there. A click is
 * what a person does and does not race the focus.
 */
async function closeAnyPane(page: Page) {
  const pane = page.getByRole('dialog')
  if ((await pane.count()) === 0) return
  await pane.getByRole('button', { name: 'Close' }).click()
  const discard = page.getByRole('button', { name: 'Discard changes' })
  if ((await discard.count()) > 0) await discard.click()
  await expect(pane).toHaveCount(0)
}

/**
 * Opens a row's detail. The pane opens in reading mode, so a test that is about an EDIT asks for
 * editing mode as well; the tests about opening, closing and focus deliberately do not, because
 * what they pin is what happens on open.
 */
async function reopen(page: Page, title: string, edit = true) {
  // Saving returns the pane to reading rather than closing it, so a reopen starts by stepping
  // out of whatever is open -- otherwise the row click lands on a pane that is already showing.
  await closeAnyPane(page)
  await row(page, title).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  if (edit) await editDetail(page)
}

async function seedOneTask(page: Page, edit = true) {
  await navLink(page, 'Projects').click()
  await submitCreate(page, 'New project', 'P')
  await openProject(page, 'P', true)
  await submitCreate(page, 'New task', '写方案')
  await reopen(page, '写方案', edit)
}

test('edits persist across a reload', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  const url = page.url()

  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('先问清需求')
  await setDetailStatus(page, 'In progress')
  await page.getByLabel('Plan', { exact: true }).fill(PLAN)
  await save(page)

  await page.goto(url)
  await reopen(page, '写方案')
  await expect(page.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('先问清需求')
  await expect(page.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue(PLAN_SAID)
})

test('title and due time persist across a reload', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  const url = page.url()

  await page.getByLabel('Title').fill('写方案 v2')
  await setDue(page, DUE, '14:30')
  await save(page)

  await page.goto(url)
  await reopen(page, '写方案 v2')
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')
  // Local wall-clock in, local wall-clock out: the instant round trip must not shift it.
  await expect(page.getByLabel('Due time')).toHaveValue('14:30')
})

test('moves a task to another project', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)

  await pickOne(page, 'Projects', 'Inbox')
  await save(page)

  // It leaves the project it was in...
  await expect(row(page, '写方案')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // ...and arrives in the other one.
  await navLink(page, 'Projects').click()
  await openProject(page, 'Inbox')
  await expect(row(page, '写方案')).toBeVisible()
})

test('clearing a date removes it rather than sending an empty string', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByLabel('Plan', { exact: true }).fill(PLAN)
  await save(page)

  // The date really was stored; otherwise clearing it proves nothing.
  await page.reload()
  await reopen(page, '写方案')
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue(PLAN_SAID)

  await page.getByLabel('Plan', { exact: true }).fill('')
  const res = await save(page)
  expect(res.request().postDataJSON()).toEqual({ scheduledOn: null })
  await page.reload()
  await reopen(page, '写方案')
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('')
})

/**
 * THE PATCH BODY IS THE DIFF. What is pinned is the BODY -- which fields the request names:
 *
 * - a field typed into is named;
 * - a field never touched is ABSENT, even when the form plainly holds a value for it (an untouched
 *   deadline must not be rewritten at minute precision, which is what sending it would do);
 * - a field typed into and then typed BACK to what it was is absent too, because nothing changed.
 */
test('the PATCH names the fields that changed, and only those', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)

  // Give the task a deadline and a plan first, so there is something the save COULD wrongly resend.
  await setDue(page, DUE, '09:15')
  await page.getByLabel('Plan', { exact: true }).fill(PLAN)
  expect((await save(page)).request().postDataJSON()).toEqual({
    dueAt: new Date(`${DUE}T09:15`).toISOString(),
    scheduledOn: PLAN,
  })

  // One field edited: one field in the body. Not the title, not the notes, and -- the point --
  // not the deadline, which the form is still holding. (`reopen` leaves the pane first: saving
  // returns it to reading rather than closing it.)
  await reopen(page, '写方案')
  await setDetailStatus(page, 'In progress')
  expect((await save(page)).request().postDataJSON()).toEqual({ status: 'in_progress' })

  // Edited and put back: nothing changed, so the body does not mention it. The title goes along for
  // the ride so that a request is sent at all and the assertion is about what is MISSING from it.
  await reopen(page, '写方案')
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('先问清需求')
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('')
  await page.getByLabel('Title').fill('写方案 v2')
  expect((await save(page)).request().postDataJSON()).toEqual({ title: '写方案 v2' })

  // And the server still holds everything the three saves never mentioned.
  const listed = await (
    await page.request.get(
      page
        .url()
        .replace(/\?.*$/, '')
        .replace(/\/projects\//, '/api/v1/tasks?projectId='),
    )
  ).json()
  const task = (listed.tasks as Record<string, unknown>[])[0]!
  expect(task.scheduledOn).toBe(PLAN)
  expect(task.status).toBe('in_progress')
  expect(task.notes).toBeNull()
  expect(new Date(task.dueAt as string).toISOString()).toBe(new Date(`${DUE}T09:15`).toISOString())
})

test('a rejected save says why and leaves the panel open', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.route(PATCH_URL, (r) =>
    r.request().method() === 'PATCH'
      ? r.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Those notes are too long',
          }),
        })
      : r.continue(),
  )
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('x')
  await page.getByRole('button', { name: 'Save' }).click()
  // The server's sentence for the person, not its status title.
  await expect(page.getByRole('alert')).toContainText('Those notes are too long')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('dragging a row does not open the detail', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const handle = page.getByRole('button', { name: 'Task: 写方案', exact: true })
  const box = await handle.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('clicking the drag handle focuses it and does not open the detail', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Task: 写方案', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // Enter on the focused handle is the keyboard way in.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test.describe('due time in a non-UTC zone', () => {
  test.use({ timezoneId: 'Asia/Kolkata' })

  // The round trip alone cannot catch a symmetric bug (UTC both ways): the wire value is what
  // the API segments overdue/today on, so that is what is asserted. +05:30 has no DST and the
  // wall-clock date differs from the UTC date, so sign, minute and date-part errors all show.
  test('the due time is sent as the instant the local wall-clock time means', async ({ page }) => {
    await registerFreshUser(page)
    await seedOneTask(page)
    await setDue(page, DUE, '02:30')
    const res = await save(page)
    expect(res.request().postDataJSON()).toEqual({ dueAt: `${addDaysYmd(DUE, -1)}T21:00:00.000Z` })

    await page.reload()
    await reopen(page, '写方案')
    await expect(page.getByLabel('Due time')).toHaveValue('02:30')
  })
})

test('opening moves focus into the panel and closing returns it to the handle', async ({
  page,
}) => {
  await registerFreshUser(page)
  await seedOneTask(page, false)
  await expect(page.getByRole('dialog')).toBeFocused()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Task: 写方案', exact: true })).toBeFocused()
})

test('Escape closes the panel and returns focus to the handle', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page, false)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Task: 写方案', exact: true })).toBeFocused()
})

test('a rejected move is reported and nothing changes', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  const url = page.url()
  const unrouteMoves = await routeMoves(page, (r) => r.fulfill({ status: 500, body: '{}' }))
  await pickOne(page, 'Projects', 'Inbox')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(row(page, '写方案')).toHaveCount(1)

  // The server agrees: the task is still in P, and Inbox has nothing.
  await unrouteMoves()
  await page.goto(url)
  await expect(row(page, '写方案')).toHaveCount(1)
  await navLink(page, 'Projects').click()
  await openProject(page, 'Inbox')
  await expect(row(page, '写方案')).toHaveCount(0)
})

// A task that leaves the list while its panel is open unmounts the panel without onClose; focus
// must land on a remaining row, not fall to <body> (WCAG 2.4.3).
test('moving a task away returns focus to a remaining row', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByRole('button', { name: 'Close' }).click()
  await submitCreate(page, 'New task', '留下')
  await reopen(page, '写方案')
  await expect(page.getByRole('dialog')).toBeVisible()

  await pickOne(page, 'Projects', 'Inbox')
  await save(page)

  await expect(row(page, '写方案')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Task: 留下', exact: true })).toBeFocused()
})

test('Edit opens on the status just picked in reading, and picking the old one back saves it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '换个状态')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: '换个状态' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })

  const written = patchAnswered(page, 'tasks/')
  await pane.getByRole('button', { name: 'Status: To do' }).click()
  await page.getByRole('menuitem', { name: 'In progress' }).click()
  await written
  await expect(pane.getByRole('button', { name: 'Status: In progress' })).toBeVisible()

  await editDetail(page)
  await expect(pane.getByRole('radio', { name: 'In progress', exact: true })).toBeChecked()
  await setDetailStatus(page, 'To do')
  const body = (await save(page)).request().postDataJSON()
  expect(body).toMatchObject({ status: 'todo' })
})
