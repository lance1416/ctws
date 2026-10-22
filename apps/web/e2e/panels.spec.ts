import { expect, test } from '@playwright/test'
import {
  backdateProjectActivity,
  makeProject,
  makeTask,
  movementOf,
  registerFreshUser,
  WEB,
} from './helpers'

/**
 * TODAY'S "THIS WEEK" (FR-079, artboard 12): closed per project, and which project has gone quiet.
 *
 * - The numbers are compared against the SERVER's own answer, so a block that quietly counted
 *   client-side would have to agree with the query that produced it.
 * - "Quiet" needs both halves: a chip always drawn passes a test that only looks for it, and one
 *   never drawn passes a test that only looks for its absence.
 */

const WIDE = { width: 1440, height: 1000 }

test('This week shows what the server counts, for every project with something to say', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const ctws = await makeProject(page, '甲线')
  const job = await makeProject(page, '乙线')
  await makeProject(page, '丙线')

  // 甲线: two finished today, three left. 乙线: nothing finished, two left.
  for (const t of ['甲一', '甲二']) await makeTask(page, ctws, t, { status: 'done' })
  for (const t of ['甲三', '甲四', '甲五']) await makeTask(page, ctws, t)
  for (const t of ['乙一', '乙二']) await makeTask(page, job, t)
  // 丙线 has nothing at all, so it gets no line: "0" is not news.

  await page.goto('/today')
  const week = page.getByRole('region', { name: 'This week' })
  const server = await movementOf(page)
  const withSomething = server.filter((r) => r.doneThisWeek > 0 || r.remaining > 0)
  expect(withSomething.map((r) => [r.projectName, r.doneThisWeek])).toEqual([
    ['甲线', 2],
    ['乙线', 0],
  ])
  for (const r of withSomething) {
    const row = week.locator(`[data-week-row="${r.projectId}"]`)
    await expect(row.getByLabel(`${r.doneThisWeek} closed this week`)).toBeVisible()
  }
  await expect(week.getByText('丙线')).toHaveCount(0)
  await expect(week.locator('[data-week-row]')).toHaveCount(withSomething.length)
})

test('a project is said to be quiet only while it really is', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const live = await makeProject(page, '天天动的')
  const stale = await makeProject(page, '没人管的')
  const finished = await makeProject(page, '已经做完的')

  await makeTask(page, live, '今天刚碰过')
  await makeTask(page, stale, '放了很久')
  const done = await makeTask(page, finished, '早就做完')
  await page.request.patch(`/api/v1/tasks/${done}`, { headers: WEB, data: { status: 'done' } })

  // Two projects have been silent for nine days. Only one of them still has work in it.
  backdateProjectActivity(stale, '9 days')
  backdateProjectActivity(finished, '9 days')

  await page.goto('/today')
  const week = page.getByRole('region', { name: 'This week' })
  const quiet = (await movementOf(page)).find((r) => r.projectId === stale)!
  expect(quiet.quietDays).toBe(9)

  const chip = week.locator('[data-stagnant]')
  await expect(chip).toHaveCount(1)
  await expect(chip).toHaveAttribute('data-stagnant', stale)
  await expect(chip).toHaveText(`Quiet for ${quiet.quietDays} days`)

  // Touch it: it stops being quiet. (Without this half, a chip that is ALWAYS drawn would pass.)
  await makeTask(page, stale, '又动了一下')
  await page.reload()
  await expect(week.getByText('没人管的')).toBeVisible()
  await expect(week.locator('[data-stagnant]')).toHaveCount(0)
})
