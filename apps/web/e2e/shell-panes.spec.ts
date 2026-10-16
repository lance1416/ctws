import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, openDetail, registerFreshUser, sidewaysScroll } from './helpers'

// The three-pane shell: the left rail's counts, and no sideways scroll at the narrow end.

const WIDE = { width: 1440, height: 900 }
const PHONE = { width: 375, height: 667 }

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' })

// The left rail is the only place that answers "how much is waiting over there" before you
// click. The number is the SERVER's, so it is compared against the API rather than against a
// number this test computes for itself.
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

// A page that scrolls sideways on a phone is unusable: the rail, the capture bar and the type are
// all chances to overflow.
test('nothing scrolls sideways at 375px', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '一个名字相当长的项目用来挤宽度')
  await makeTask(page, pid, '一条标题也很长的任务，用来看它会不会把这一行撑出屏幕之外去')
  await makeTask(page, pid, '逾期的那条', { dueAt: '2020-01-01T09:00:00.000Z' })
  // LONG, and in progress: the banner sets its subject at the scale's top step (36/44), so a short
  // title there fits 375 whatever the banner does with overflow.
  await makeTask(page, pid, '在做的那条，标题长到足以把三十六像素的横幅主语挤出一部手机的宽度去', {
    status: 'in_progress',
  })

  await page.setViewportSize(PHONE)
  const overflow = () => sidewaysScroll(page)

  for (const [name, url] of [
    ['Workbench', '/'],
    ['Projects', '/projects'],
    ['the project', `/projects/${pid}`],
    ['Done', '/tasks/review?view=done'],
  ] as const) {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await overflow(), name).toEqual({ doc: 0, body: 0 })
  }

  // And with the detail open, which at this width is a layer over the page.
  await page.goto(`/projects/${pid}`)
  await openDetail(page, '逾期的那条')
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  expect(await overflow(), 'with the detail open').toEqual({ doc: 0, body: 0 })
})
