import { expect, test, type Page } from '@playwright/test'
import { accountZone, makeProject, makeTask, registerFreshUser, WEB } from './helpers'
import { dayOffset } from './days'

/**
 * THE SIX PAGES PHASE 4 REDREW, ON A PHONE. At 320 and 375:
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
  await page.request.post('/api/v1/meetings', {
    headers: WEB,
    data: {
      title: 'Second interview',
      startsLocal: `${dayOffset(1)}T14:00`,
      timeZone: zone,
      durationMinutes: 60,
      projectId: pid,
    },
  })
  const book = await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: 'Cracking the Coding Interview', projectId: pid },
  })
  const { id } = (await book.json()) as { id: string }
  await page.request.patch(`/api/v1/reading/${id}`, {
    headers: WEB,
    data: { planOn: dayOffset(1) },
  })
  await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', birthday: { calendar: 'solar', month: 5, day: 28 } },
  })
}

const problems = (page: Page) =>
  page.evaluate(() => {
    const out: string[] = []
    const sideways = document.documentElement.scrollWidth - innerWidth
    if (sideways > 0) out.push(`scrolls sideways by ${sideways}px`)
    for (const b of document.querySelectorAll<HTMLElement>('main button, main a'))
      if (b.offsetHeight > 0 && b.scrollHeight > b.clientHeight + 1 && b.clientHeight <= 40)
        out.push(`wraps inside: "${b.textContent?.trim()}"`)
    for (const m of document.querySelectorAll<HTMLElement>('[data-row-lead], [data-birthday-lead]'))
      for (const c of m.children) {
        const left = c.getBoundingClientRect().left
        if (c.getBoundingClientRect().width > 0 && left < 8)
          out.push(`margin word "${m.textContent}" starts ${left.toFixed(1)}px from the edge`)
      }
    return out
  })

for (const width of [320, 375]) {
  test(`the redrawn pages fit a ${width}px phone`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await registerFreshUser(page)
    await seed(page)
    for (const path of [
      '/projects',
      '/meetings',
      '/reading',
      '/tasks/review',
      '/tasks/review?view=done',
      '/people',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      expect(await problems(page), path).toEqual([])
    }
    // Review with its stepper at its widest: a week back, so "This week" is there too.
    await page.goto('/tasks/review')
    await page.getByRole('button', { name: 'The week before' }).click()
    await expect(page.getByRole('button', { name: 'This week' })).toBeVisible()
    expect(await problems(page), 'review, a week back').toEqual([])
  })
}
