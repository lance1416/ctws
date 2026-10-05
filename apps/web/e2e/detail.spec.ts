import { expect, test, type Page } from '@playwright/test'
import { openProject, registerFreshUser, setDetailStatus, submitCreate } from './helpers'

const PATCH_URL = /\/tasks\/[^/]+$/
const MOVE_URL = /\/tasks\/[^/]+\/move$/

/** Clicks Save and resolves once the server has accepted the request, i.e. it is persisted. */
async function save(page: Page, url: RegExp = PATCH_URL) {
  const done = page.waitForResponse((r) => url.test(r.url()) && r.request().method() !== 'GET')
  await page.getByRole('button', { name: '保存' }).click()
  const res = await done
  expect(res.ok()).toBeTruthy()
  return res
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

async function seedOneTask(page: Page) {
  await page.getByRole('link', { name: '项目' }).click()
  await submitCreate(page, '新项目', 'P')
  await openProject(page, 'P', true)
  await submitCreate(page, '新任务', '写方案')
  await row(page, '写方案').click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('edits persist across a reload', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  const url = page.url()

  await page.getByLabel('备注').fill('先问清需求')
  await setDetailStatus(page, '进行中')
  await page.getByLabel('排期').fill('2026-10-02')
  await save(page)

  await page.goto(url)
  await row(page, '写方案').click()
  await expect(page.getByLabel('备注')).toHaveValue('先问清需求')
  await expect(page.getByRole('radio', { name: '进行中', exact: true })).toBeChecked()
  await expect(page.getByLabel('排期')).toHaveValue('2026-10-02')
})

test('title and due time persist across a reload', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  const url = page.url()

  await page.getByLabel('标题').fill('写方案 v2')
  await page.getByLabel('截止').fill('2026-10-03T14:30')
  await save(page)

  await page.goto(url)
  await row(page, '写方案 v2').click()
  await expect(page.getByLabel('标题')).toHaveValue('写方案 v2')
  // Local wall-clock in, local wall-clock out: the instant round trip must not shift it.
  await expect(page.getByLabel('截止')).toHaveValue('2026-10-03T14:30')
})

test('moves a task to another project', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)

  await page.getByLabel('项目').selectOption({ label: 'Inbox' })
  await save(page, MOVE_URL)

  // It leaves the project it was in...
  await expect(row(page, '写方案')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // ...and arrives in the other one.
  await page.getByRole('link', { name: '项目' }).click()
  await openProject(page, 'Inbox')
  await expect(row(page, '写方案')).toBeVisible()
})

test('clearing a date removes it rather than sending an empty string', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByLabel('排期').fill('2026-10-02')
  await save(page)

  // The date really was stored; otherwise clearing it proves nothing.
  await page.reload()
  await row(page, '写方案').click()
  await expect(page.getByLabel('排期')).toHaveValue('2026-10-02')

  await page.getByLabel('排期').fill('')
  const res = await save(page)
  expect(res.request().postDataJSON()).toEqual({ scheduledOn: null })
  await page.reload()
  await row(page, '写方案').click()
  await expect(page.getByLabel('排期')).toHaveValue('')
})

test('a rejected save is reported and leaves the panel open', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.route(PATCH_URL, (r) =>
    r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
  )
  await page.getByLabel('备注').fill('x')
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('dragging a row does not open the detail', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const handle = page.getByRole('button', { name: '任务：写方案', exact: true })
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
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: '任务：写方案', exact: true }).click()
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
    await page.getByLabel('截止').fill('2026-10-03T02:30')
    const res = await save(page)
    expect(res.request().postDataJSON()).toEqual({ dueAt: '2026-10-02T21:00:00.000Z' })

    await page.reload()
    await row(page, '写方案').click()
    await expect(page.getByLabel('截止')).toHaveValue('2026-10-03T02:30')
  })
})

test('opening moves focus into the panel and closing returns it to the handle', async ({
  page,
}) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await expect(page.getByRole('dialog')).toBeFocused()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '任务：写方案', exact: true })).toBeFocused()
})

test('Escape closes the panel and returns focus to the handle', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '任务：写方案', exact: true })).toBeFocused()
})

test('a rejected move is reported and nothing changes', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  const url = page.url()
  await page.route(MOVE_URL, (r) => r.fulfill({ status: 500, body: '{}' }))
  await page.getByLabel('项目').selectOption({ label: 'Inbox' })
  await page.getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(row(page, '写方案')).toHaveCount(1)

  // The server agrees: the task is still in P, and Inbox has nothing.
  await page.unroute(MOVE_URL)
  await page.goto(url)
  await expect(row(page, '写方案')).toHaveCount(1)
  await page.getByRole('link', { name: '项目' }).click()
  await openProject(page, 'Inbox')
  await expect(row(page, '写方案')).toHaveCount(0)
})

// A task that leaves the list while its panel is open unmounts the panel without onClose; focus
// must land on a remaining row, not fall to <body> (WCAG 2.4.3).
test('moving a task away returns focus to a remaining row', async ({ page }) => {
  await registerFreshUser(page)
  await seedOneTask(page)
  await page.getByRole('button', { name: '关闭' }).click()
  await submitCreate(page, '新任务', '留下')
  await row(page, '写方案').click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByLabel('项目').selectOption({ label: 'Inbox' })
  await save(page, MOVE_URL)

  await expect(row(page, '写方案')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '任务：留下', exact: true })).toBeFocused()
})
