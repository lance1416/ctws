import { expect, test, type Page } from '@playwright/test'
import {
  accountZone,
  makeProject,
  makeReading,
  makeTask,
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
  // Being read: a card, with its project and since when (FR-072).
  await makeReading(
    page,
    { kind: 'book', title: 'Designing Data-Intensive Applications' },
    { author: 'Martin Kleppmann', projectId: pid, status: 'reading' },
  )
  // A note hung on the project: its row names what it hangs on (FR-074).
  await apiPost(page, '/notes', {
    title: 'Questions to ask the interviewer',
    body: '- What does a first week look like?',
    anchor: { type: 'project', id: pid },
  })
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
      // The overviews: a card for what is being read, a row for what is waiting (FR-072, FR-074).
      ['/reading', 'Designing Data-Intensive Applications'],
      ['/reading', 'Cracking the Coding Interview'],
      ['/notes', 'Questions to ask the interviewer'],
      ['/review', 'Done one'],
      ['/review?view=done', 'Done one'],
      // The overview: its blocks are what must fit (FR-060).
      ['/people', 'Recently in touch'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('main').getByText(shown).first()).toBeVisible()
      expect(await problems(page), path).toEqual([])
    }
    // Review a week back, where both steps are live.
    await page.goto('/review')
    await page.getByRole('button', { name: 'Previous week' }).click()
    await expect(page.getByRole('button', { name: 'Next week' })).toBeEnabled()
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

// Today's rows are blocks' rows now (artboard 12), each block with its own inset; the phone's
// Today is phase 4 (STORY-037).
test('Completed starts 14px past the thread on a phone too', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Gutter')
  await makeTask(page, pid, 'Finished', { status: 'done' })

  await page.goto('/review?view=done')
  expect(await bodyStart(page, 'Finished'), 'Completed').toBe('14px')
})
