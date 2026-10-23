import { expect, test } from '@playwright/test'
import {
  makeProject,
  makeTask,
  openTaskPane,
  registerFreshUser,
  saveTaskBody,
  serverTask,
} from './helpers'

/**
 * THE PANE'S NAMED DAYS, on the server pinned at Thursday, October 22, 2026, 00:30 UTC (01:30 in
 * London, pinned.ts). Tomorrow is Friday the 23rd and next week is Monday the 26th whenever the
 * suite runs: no Sunday on which next Monday is tomorrow, no December on which tomorrow is in
 * another year.
 */
test.use({ timezoneId: 'Europe/London' })

test('the named plan decisions write the same scheduledOn the exact field writes', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const id = await makeTask(page, pid, '改简历')
  await openTaskPane(page, pid, '改简历')

  await page.getByRole('button', { name: 'Plan for tomorrow', exact: true }).click()
  expect(await saveTaskBody(page)).toEqual({ scheduledOn: '2026-10-23' })
  expect((await serverTask(page, pid, id)).scheduledOn).toBe('2026-10-23')

  // The named decision and the exact field are two ways to the SAME field, not two fields.
  await openTaskPane(page, pid, '改简历')
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('Oct 23')
  // Not next Monday itself: "next week" below would then write the value already stored, the form
  // would not be dirty, and no request would be sent.
  await page.getByLabel('Plan', { exact: true }).fill('2026-10-27')
  expect(await saveTaskBody(page)).toEqual({ scheduledOn: '2026-10-27' })

  await openTaskPane(page, pid, '改简历')
  await page.getByRole('button', { name: 'Plan for next week', exact: true }).click()
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('Oct 26')
  expect(await saveTaskBody(page)).toEqual({ scheduledOn: '2026-10-26' })

  await openTaskPane(page, pid, '改简历')
  await page.getByRole('button', { name: 'Clear the plan', exact: true }).click()
  await expect(page.getByLabel('Plan', { exact: true })).toHaveValue('')
  expect(await saveTaskBody(page)).toEqual({ scheduledOn: null })
  expect((await serverTask(page, pid, id)).scheduledOn).toBeNull()
})

test('the pane says the day back in the app’s own words, not the field’s format', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '看日期')
  await openTaskPane(page, pid, '看日期')

  const dialog = page.getByRole('dialog', { name: 'Task details' })
  await page.getByRole('button', { name: 'Plan for tomorrow', exact: true }).click()
  // A native date input prints its format in the BROWSER'S UI language, which no page can set;
  // the echo is the app saying which day it understood, and it is right whatever the field prints.
  // The echo is the line under the field; the named days are buttons that say "Tomorrow" too.
  const echo = (said: string) => dialog.getByRole('paragraph').filter({ hasText: said })
  await expect(echo('Tomorrow')).toBeVisible()
  await page.getByRole('button', { name: 'Plan for next week', exact: true }).click()
  await expect(echo('Oct 26')).toBeVisible()
  // The wire format never reaches the screen as a reading.
  await expect(dialog.getByText(/^\d{4}-\d{2}-\d{2}$/)).toHaveCount(0)
})
