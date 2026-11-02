import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, openTree, registerFreshUser } from './helpers'

/**
 * WHAT A DATE SAYS WHERE IT DEPENDS ON TODAY, on the server pinned at Thursday, October 22, 2026,
 * 00:30 UTC (01:30 in London): every expected word comes from that instant (pinned.ts), never
 * from the clock the suite happens to run under.
 */
test.use({ timezoneId: 'Europe/London' })

const treeRow = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `Task: ${title}`, exact: true }) })

test('the tree shows deadlines only where they mean something', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  // Five days late; due at 23:30 tonight in London (BST); planned for tomorrow; no date.
  await makeTask(page, pid, '逾期的', { dueAt: '2026-10-17T11:00:00Z' })
  await makeTask(page, pid, '今天截止', { dueAt: '2026-10-22T22:30:00Z' })
  await makeTask(page, pid, '只排期', { scheduledOn: '2026-10-23' })
  await makeTask(page, pid, '没日期')
  await openTree(page, pid)

  const due = (title: string) => treeRow(page, title).locator('[data-row-due]')
  // Missed: the day it was due, on red, flagged.
  await expect(due('逾期的')).toHaveAttribute('data-row-due', 'late')
  await expect(due('逾期的')).toContainText('Oct 17')
  // Due today at the end of the day is a day, not a minute before midnight.
  await expect(due('今天截止')).toHaveAttribute('data-row-due', 'soon')
  await expect(due('今天截止')).toContainText('Today')
  // A plan is the detail's to say, and a dateless row says nothing: the row is still a row.
  await expect(due('只排期')).toHaveCount(0)
  await expect(due('没日期')).toHaveCount(0)
})

test('an empty Today says Nothing yet, and stops saying it when something is planned', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')

  const planned = page.getByRole('region', { name: 'Planned for today' })
  await expect(planned).toContainText('Nothing yet')

  // The other half: with something planned for the pinned day, the words go.
  await makeTask(page, pid, '今天要做的', { scheduledOn: '2026-10-22' })
  await page.goto('/today')
  await expect(planned.getByText('今天要做的')).toBeVisible()
  await expect(planned).not.toContainText('Nothing yet')
})
