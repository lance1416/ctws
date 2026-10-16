import { expect, test, type Page } from '@playwright/test'
import {
  accountZone,
  dayInZone,
  makeProject,
  makeReading,
  makeTask,
  meetingToday,
  registerFreshUser,
  sidewaysScroll,
  apiPost,
} from './helpers'
import { dayOffset } from './days'

/**
 * THE LIST PAGES, ON A PHONE. At 320 and 375:
 * - nothing scrolls sideways;
 * - no button's words wrap inside it (a 36px button holding two lines of text);
 * - every word in a row's margin stays clear of the screen's edge. The margin is a right-aligned
 *   column, so its widest words may run into the page's 16px gutter -- never more than half of it.
 *
 * The margin's words are measured by their own boxes, not by the margin's scroll width: a
 * right-aligned box that overflows does so to the LEFT, and scrollWidth does not count that.
 */

async function seed(page: Page) {
  const zone = await accountZone(page)
  const pid = await makeProject(page, '找工作')
  // The widest margin words: a dated deadline with its flag, and a plan for tomorrow.
  await makeTask(page, pid, 'Far deadline', { dueAt: '2030-05-28T12:00:00Z' })
  await makeTask(page, pid, 'Done one', { status: 'done' })
  await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: `${dayOffset(1)}T14:00`,
    timeZone: zone,
    durationMinutes: 60,
    projectId: pid,
  })
  await makeReading(
    page,
    { kind: 'book', title: 'Cracking the Coding Interview' },
    { projectId: pid, planOn: dayOffset(1) },
  )
  await apiPost(page, '/people', {
    name: '陈颖',
    birthday: { calendar: 'solar', month: 5, day: 28 },
  })
}

const problems = async (page: Page) => {
  const sideways = await sidewaysScroll(page)
  const out: string[] =
    sideways.doc > 0 || sideways.body > 0 ? [`scrolls sideways: ${JSON.stringify(sideways)}`] : []
  return out.concat(
    await page.evaluate(() => {
      const out: string[] = []
      for (const b of document.querySelectorAll<HTMLElement>('main button, main a'))
        if (b.offsetHeight > 0 && b.scrollHeight > b.clientHeight + 1 && b.clientHeight <= 40)
          out.push(`wraps inside: "${b.textContent?.trim()}"`)
      for (const m of document.querySelectorAll<HTMLElement>(
        '[data-row-lead], [data-birthday-lead]',
      ))
        for (const c of m.children) {
          const left = c.getBoundingClientRect().left
          if (c.getBoundingClientRect().width > 0 && left < 8)
            out.push(`margin word "${m.textContent}" starts ${left.toFixed(1)}px from the edge`)
        }
      return out
    }),
  )
}

for (const width of [320, 375]) {
  test(`the list pages fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await registerFreshUser(page)
    await seed(page)
    // Each page is checked once its seeded rows are on screen, so the widest words are measured.
    for (const [path, shown] of [
      ['/projects', '找工作'],
      ['/meetings', 'Second interview'],
      ['/reading', 'Cracking the Coding Interview'],
      ['/tasks/review', 'Done one'],
      ['/tasks/review?view=done', 'Done one'],
      ['/people', '陈颖'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('main').getByText(shown).first()).toBeVisible()
      expect(await problems(page), path).toEqual([])
    }
    // Review with its stepper at its widest: a week back, so "This week" is there too.
    await page.goto('/tasks/review')
    await page.getByRole('button', { name: 'The week before' }).click()
    await expect(page.getByRole('button', { name: 'This week' })).toBeVisible()
    expect(await problems(page), 'review, a week back').toEqual([])
  })
}

/** How far in a row's body starts: the padding of the li's child that holds `title`. */
const bodyStart = (page: Page, title: string) =>
  page
    .getByRole('main')
    .getByText(title, { exact: true })
    .first()
    .evaluate((el) => {
      let at: Element = el
      while (at.parentElement && at.parentElement.tagName !== 'LI') at = at.parentElement
      return getComputedStyle(at).paddingLeft
    })

test("Today's rows, Done today and Completed start 14px past the thread on a phone too", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await registerFreshUser(page)
  const zone = await accountZone(page)
  const pid = await makeProject(page, 'Gutter')
  await makeTask(page, pid, 'Planned today', { scheduledOn: dayInZone(zone) })
  await makeTask(page, pid, 'Under way', { status: 'in_progress' })
  await makeTask(page, pid, 'Finished', { status: 'done' })
  await meetingToday(page, 'Standup', '23:59', zone)

  await page.goto('/tasks/today')
  for (const title of ['Planned today', 'Under way', 'Finished', 'Standup'])
    expect(await bodyStart(page, title), title).toBe('14px')

  await page.goto('/tasks/review?view=done')
  expect(await bodyStart(page, 'Finished'), 'Completed').toBe('14px')
})
