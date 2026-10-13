import { expect, test } from '@playwright/test'
import { TZDate } from '@date-fns/tz'
import { accountZone, dayInZone, makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * THE PROJECT LIST, ON THE APP'S ROW: the margin says when the next deadline falls, the thread is
 * the project's colour, and the body names it and says what is open, what is late and when it last
 * moved. A line of work that is archived sits under its own heading, not among the live ones.
 */
test('the project list hangs on the margin: next deadline, thread, then the line of work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const job = await makeProject(page, '找工作')
  const old = await makeProject(page, 'Old thing')
  // A deadline on a fixed day years out -- so the margin's word does not depend on today -- and
  // one two days gone on the ACCOUNT's clock.
  const [y, m, d] = dayInZone(zone).split('-').map(Number) as [number, number, number]
  await makeTask(page, job, 'Mock interview', { dueAt: '2030-05-28T12:00:00Z' })
  await makeTask(page, job, 'Update the résumé', {
    dueAt: new TZDate(y, m - 1, d - 2, 12, 0, 0, 0, zone).toISOString(),
  })
  const archived = await page.request.patch(`/api/v1/projects/${old}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(archived.ok(), await archived.text()).toBe(true)
  await page.goto('/projects')

  const row = page.locator(`[data-project-row="${job}"]`)
  // The margin: the next deadline still standing, as the margin words a deadline beyond this
  // week -- its date -- with the flag.
  await expect(row.locator('[data-row-lead-text]')).toHaveText('May 28')
  await expect(row.locator('[data-flag]')).toHaveCount(1)
  // The thread is its colour; its name is the link, and only the name.
  await expect(row.locator('[data-project-rail]')).toHaveAttribute('data-project-rail', job)
  await expect(row.getByRole('link', { name: '找工作', exact: true })).toHaveAttribute(
    'href',
    `/projects/${job}`,
  )
  // What is open and what is late, under the name.
  await expect(row.locator('[data-project-meta]')).toContainText('2 open')
  await expect(row.locator('[data-project-meta]')).toContainText('1 overdue')

  // ONE x for the threads, and the page's heading hangs on it.
  const threads = await page
    .locator('[data-project-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'Projects' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])

  // The archived one is under its own heading, and not among the live lines of work.
  const shelf = page.getByRole('region', { name: 'Archived' })
  await expect(shelf).toContainText('Old thing')
  await expect(page.getByRole('region', { name: 'Active' })).not.toContainText('Old thing')

  // The whole row is the way in, not only the four characters of a name: a click on the row's
  // middle -- over its meta line, which the name's link is stretched across -- opens the project.
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/projects/${job}$`))
})

/** An archived project's row opens its page, which says it is archived -- not that it is gone. */
test('an archived project opens as itself, marked archived', async ({ page }) => {
  await registerFreshUser(page)
  const old = await makeProject(page, 'Old thing')
  await makeTask(page, old, 'Something left in it')
  const res = await page.request.patch(`/api/v1/projects/${old}`, {
    headers: WEB,
    data: { archived: true },
  })
  expect(res.ok(), await res.text()).toBe(true)
  await page.goto('/projects')
  await page.locator(`[data-project-row="${old}"]`).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${old}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Old thing' })).toBeVisible()
  await expect(page.locator('[data-project-archived]')).toHaveText('Archived')
  await expect(page.getByText('This project is not here any more.')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Location' })).not.toContainText('Not found')
  await expect(page.getByText('Something left in it')).toBeVisible()
})
