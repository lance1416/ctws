import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, openDetail, registerFreshUser, sidewaysScroll } from './helpers'

// The three-pane workbench: the left rail's counts, the detail as a column rather than a layer,
// and the one thing the narrow end of the range must never do.

const WIDE = { width: 1440, height: 900 }
// 1024: the widest viewport that is still BELOW the 1280 threshold, so it is the case a
// min-width rule gets wrong most easily -- the rail is there, the pane is not.
const MEDIUM = { width: 1024, height: 800 }
const PHONE = { width: 375, height: 667 }

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })

/** The box of an element, or null when it is not laid out. */
async function box(page: Page, selector: string) {
  return page.locator(selector).first().boundingBox()
}

/**
 * The responsive rule, asserted at BOTH ends. A single-viewport test proves nothing about a
 * min-width rule: a panel that is always a pane passes a 1440-only test, and one that is always
 * an overlay passes a 1024-only test. What distinguishes them is only visible from both sides.
 *
 * "Coexisting" is asserted geometrically, not by a class name: the pane must not sit on top of
 * the row it was opened from, and nothing invisible may be laid over the list. A class could say
 * `pane` while a full-page backdrop still swallowed every click.
 */
test('the task detail is a coexisting pane at 1280 and up, and an overlay below it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '面板')
  await makeTask(page, pid, '被打开的任务')
  await makeTask(page, pid, '旁边的任务')

  // --- wide: a third column ---
  await page.setViewportSize(WIDE)
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '被打开的任务')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-detail-mode', 'pane')
  // No layer over the page: as a column, a click on the list is a click on the list.
  await expect(page.locator('[data-detail-backdrop]')).toHaveCount(0)

  const paneBox = (await dialog.boundingBox())!
  const rowBox = (await box(page, '[data-task-tree] li'))!
  const mainBox = (await box(page, 'main'))!
  // The row it was opened from is beside the pane, not under it.
  expect(rowBox.x + rowBox.width).toBeLessThanOrEqual(paneBox.x + 1)
  // And the centre column really gave up the width rather than being covered.
  expect(mainBox.x + mainBox.width).toBeLessThanOrEqual(paneBox.x + 1)

  // The proof that it coexists: the list is still operable while the detail is open. Clicking
  // the OTHER row loads that task into the same pane, with no closing step in between.
  await page.getByRole('listitem').filter({ hasText: '旁边的任务' }).click()
  // Reading mode, so the task's name is the pane's heading rather than the value of an
  // input (rows-and-reading §5). The claim is unchanged: the OTHER row's task is now in the
  // same pane, with no closing step in between.
  await expect(dialog.locator('[data-detail-title]')).toHaveText('旁边的任务')

  // --- below the threshold: a layer ---
  await page.setViewportSize(MEDIUM)
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '被打开的任务')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-detail-mode', 'overlay')
  await expect(page.locator('[data-detail-backdrop]')).toHaveCount(1)

  const overBox = (await dialog.boundingBox())!
  const narrowMain = (await box(page, 'main'))!
  // It is over the centre column, not beside it: the right edge of main is past the panel's left
  // edge. (The same numbers that passed as "beside" above now have to fail.)
  expect(narrowMain.x + narrowMain.width).toBeGreaterThan(overBox.x + 1)
  // The way out of a layer is the layer: a press outside closes it.
  await page.locator('[data-detail-backdrop]').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toHaveCount(0)
})

// The left rail is the only place that answers "how much is waiting over there" before you
// click. The number must be the SERVER's, which is why it is compared against the API and not
// against a number this test also computes.
test('the left rail shows each project the open-task count the server reports', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const quiet = await makeProject(page, '安静的')
  const busy = await makeProject(page, '很忙的')
  for (const t of ['一', '二', '三']) await makeTask(page, busy, t)
  // Three kinds of task that must NOT be counted, so a rail showing "4" fails.
  await makeTask(page, busy, '做完了', { status: 'done' })
  await makeTask(page, busy, '取消了', { status: 'cancelled' })
  await makeTask(page, quiet, '也做完了', { status: 'done' })

  await page.goto('/tasks/today')
  const { projects } = (await (await page.request.get('/api/v1/projects')).json()) as {
    projects: { id: string; name: string; openTasks: number }[]
  }
  expect(projects.map((p) => [p.name, p.openTasks])).toEqual([
    ['Inbox', 0],
    ['安静的', 0],
    ['很忙的', 3],
  ])

  for (const p of projects) {
    const link = rail(page).getByRole('link', { name: p.name, exact: false })
    await expect(link).toHaveCount(1)
    if (p.openTasks > 0) {
      // The count sits in the link, so it is read out with the destination it belongs to.
      await expect(link.locator('[data-count]')).toHaveText(String(p.openTasks))
    } else {
      // Zero is written as nothing: a column of "0"s is noise, and an empty project is not news.
      await expect(link.locator('[data-count]')).toHaveCount(0)
    }
  }

  // The Today destination carries its own count, from the same server list the page renders.
  await makeTask(page, busy, '今天要做的', { scheduledOn: new Date().toLocaleDateString('en-CA') })
  await page.reload()
  await expect(rail(page).getByRole('link', { name: 'Today' }).locator('[data-count]')).toHaveText(
    '1',
  )
})

// 375px zero horizontal scroll, re-pinned against the new shell: the rail, the capture bar and
// the wider type are all new chances to overflow, and a page that scrolls sideways on a phone is
// unusable in a way that no amount of desktop polish makes up for.
test('nothing scrolls sideways at 375px', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '一个名字相当长的项目用来挤宽度')
  await makeTask(page, pid, '一条标题也很长的任务，用来看它会不会把这一行撑出屏幕之外去')
  await makeTask(page, pid, '逾期的那条', { dueAt: '2020-01-01T09:00:00.000Z' })
  // LONG, and in progress: the banner sets its subject at the scale's top step (36/44), so a
  // five-character title there fits 375 whatever the banner does with overflow and proves nothing.
  // Measured: with a short title this test passes even when the subject is told never to wrap.
  await makeTask(page, pid, '在做的那条，标题长到足以把三十六像素的横幅主语挤出一部手机的宽度去', {
    status: 'in_progress',
  })

  await page.setViewportSize(PHONE)
  const overflow = () => sidewaysScroll(page)

  for (const [name, url] of [
    ['Today', '/'],
    ['项目列表', '/projects'],
    ['Projects', `/projects/${pid}`],
    ['Done', '/completed'],
  ] as const) {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await overflow(), name).toEqual({ doc: 0, body: 0 })
  }

  // And with the detail open, which at this width is a layer over the page.
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '逾期的那条')
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  expect(await overflow(), '详情打开时').toEqual({ doc: 0, body: 0 })
})

/**
 * The other half of daily.spec.ts's "tab and shift+tab never leave the open panel", which holds
 * only while the detail is an overlay. As a coexisting pane it must NOT trap the keyboard: a
 * trap in a column that is not covering anything would lock the user out of the list they can
 * plainly see, which is exactly what WCAG 2.1.2 is about.
 */
test('the detail pane does not trap the keyboard at 1280 and up', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '不困住')
  await makeTask(page, pid, '开着的任务')

  await page.setViewportSize(WIDE)
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '开着的任务')
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await expect(dialog).toBeFocused()

  const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
  // More presses than the pane has controls: focus has to come out the far side.
  let escaped = false
  for (let i = 0; i < 40 && !escaped; i++) {
    await page.keyboard.press('Tab')
    escaped = !(await inside())
  }
  expect(escaped, 'Tab eventually leaves the pane').toBe(true)
  // And the pane is still open -- leaving it with Tab is not dismissing it.
  await expect(dialog).toBeVisible()
  // Escape, pressed from inside, still closes it and hands focus back to the row.
  // Pressed from inside the pane. In reading mode the control to press it on is Edit ('exact'
  // because "Keep editing" contains it); what is pinned is that Escape from inside still closes.
  await dialog.getByRole('button', { name: 'Edit', exact: true }).press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Task: 开着的任务', exact: true })).toBeFocused()
})
