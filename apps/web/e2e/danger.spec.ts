import { expect, test, type Locator } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser, WEB } from './helpers'

/**
 * 删除（取消）在哪儿：在所有东西下面，而且不高于地板。
 *
 * 一个比屏幕矮的面上，它被推到这个面的底；一个比屏幕高的面上，它排在最后一行后面，要滚到底才
 * 看得见。它前一版是 `sticky`：长的面上浮在正文上面、正文从它底下滚过去，短的面板里又根本推不到
 * 底，还涂了一层和所在面板不同的底色。这里量的就是这三件事。
 */

/** The zone, where it sits, and everything on the same surface that is not part of it. */
function measure(zone: Locator, surface: string) {
  return zone.evaluate((el, selector) => {
    const box = el.closest(selector) as HTMLElement
    const b = box.getBoundingClientRect()
    const s = getComputedStyle(box)
    const z = el.getBoundingClientRect()
    // 同一个面上、不属于删除这一块、也不是它的祖先的每一个元素：它们的下沿都得在删除的上沿之上。
    const above = Array.from(box.querySelectorAll('*'))
      .filter((n) => !el.contains(n) && !n.contains(el))
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .reduce((m, r) => Math.max(m, r.bottom), -Infinity)
    const inner = el.firstElementChild as HTMLElement
    return {
      top: z.top,
      bottom: z.bottom,
      // 这个面能放东西的最低处：面板减去它自己的内边距和边框。
      floor: b.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth),
      contentBottom: above,
      fills: [getComputedStyle(el).backgroundColor, getComputedStyle(inner).backgroundColor],
      rule: parseFloat(getComputedStyle(inner).borderTopWidth),
    }
  }, surface)
}

const CLEAR = 'rgba(0, 0, 0, 0)'

test('短的面板里，取消会议落在面板底，和面板同一个底色', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const meeting = await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: '2026-10-20T18:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  await page.goto(`/meetings/${meeting.meetingId}`)
  const zone = page.getByRole('dialog', { name: 'Meetings' }).locator('[data-danger-zone]')
  await expect(zone.getByRole('button', { name: 'Cancel meeting' })).toBeVisible()

  const m = await measure(zone, '[role="dialog"]')
  // 推到底：它的下沿就是面板的地板，而不是挂在 Linked 下面。
  expect(Math.abs(m.floor - m.bottom)).toBeLessThanOrEqual(1)
  expect(m.contentBottom).toBeLessThanOrEqual(m.top + 0.5)
  // 没有自己的底色：它属于这个面板，那条线说明它不是正文。
  expect(m.fills).toEqual([CLEAR, CLEAR])
  expect(m.rule).toBeGreaterThan(0)
})

test('笔记很长时，删除排在最后一行后面，不浮在正文上', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Reading list')
  const paragraph =
    'Covers memory, processes, threads, system calls, pointers, concurrent and parallel ' +
    'programming, and network programming, in C and on Unix.'
  await makeTask(page, pid, 'Read the C book', {
    notes: Array.from({ length: 30 }, () => paragraph).join('\n\n'),
  })
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: 'Read the C book' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Task details' })
  const zone = dialog.locator('[data-danger-zone]')
  await expect(zone.getByRole('button', { name: 'Delete task' })).toBeAttached()

  // 没滚的时候它不在屏幕上 —— 它在笔记后面，不是贴在面板底、盖着笔记。
  const atTop = await measure(zone, '[role="dialog"]')
  expect(atTop.top).toBeGreaterThan(atTop.floor)
  expect(atTop.contentBottom).toBeLessThanOrEqual(atTop.top + 0.5)

  // 滚到底，它就在地板上，正文全在它上面。
  await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight))
  const atEnd = await measure(zone, '[role="dialog"]')
  expect(Math.abs(atEnd.floor - atEnd.bottom)).toBeLessThanOrEqual(1)
  expect(atEnd.contentBottom).toBeLessThanOrEqual(atEnd.top + 0.5)
  expect(atEnd.fills).toEqual([CLEAR, CLEAR])
})

test('短的页面上，删除项目落在屏幕底', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  await page.goto(`/projects/${pid}`)
  const zone = page.locator('main [data-danger-zone]')
  await expect(zone.getByRole('button', { name: 'Delete project' })).toBeVisible()

  const m = await measure(zone, 'main')
  const viewport = await page.evaluate(() => window.innerHeight)
  expect(viewport - m.bottom).toBeLessThanOrEqual(1)
  expect(m.contentBottom).toBeLessThanOrEqual(m.top + 0.5)
  expect(m.fills).toEqual([CLEAR, CLEAR])
  expect(m.rule).toBeGreaterThan(0)
})

test('a held Enter on Delete does not also confirm it', async ({ page }) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Keep me' })
  await page.goto(`/people/${person.id}`)
  const ask = page.getByRole('button', { name: 'Delete person' })
  await ask.focus()
  // Key repeat: the second Enter lands on whatever took focus when the question opened.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(ask).toBeFocused()
  const res = await page.request.get('/api/v1/people', { headers: WEB })
  const names = ((await res.json()) as { people: { name: string }[] }).people.map((p) => p.name)
  expect(names).toContain('Keep me')
})
