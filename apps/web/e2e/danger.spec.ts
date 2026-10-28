import { expect, test, type Locator } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser, WEB } from './helpers'
import { dayOffset } from './days'

/**
 * The delete (or cancel) zone sits below everything else and never above the floor: pushed to the
 * bottom of a surface shorter than the screen, after the last line of a taller one.
 */

/** The zone, where it sits, and everything on the same surface that is not part of it. */
function measure(zone: Locator, surface: string) {
  return zone.evaluate((el, selector) => {
    const box = el.closest(selector) as HTMLElement
    const b = box.getBoundingClientRect()
    const s = getComputedStyle(box)
    const z = el.getBoundingClientRect()
    // The lowest edge of everything on the surface outside the zone and its ancestors.
    const above = Array.from(box.querySelectorAll('*'))
      .filter((n) => !el.contains(n) && !n.contains(el))
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.height > 0)
      .reduce((m, r) => Math.max(m, r.bottom), -Infinity)
    const inner = el.firstElementChild as HTMLElement
    return {
      top: z.top,
      bottom: z.bottom,
      // The lowest point the surface can hold content: its bottom less padding and border.
      floor: b.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth),
      contentBottom: above,
      fills: [getComputedStyle(el).backgroundColor, getComputedStyle(inner).backgroundColor],
      rule: parseFloat(getComputedStyle(inner).borderTopWidth),
    }
  }, surface)
}

const CLEAR = 'rgba(0, 0, 0, 0)'

test('on a meeting’s edit page, Delete this meeting comes after the last field, unfilled', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const meeting = await apiPost<{ meetingId: string; recurrenceId: string }>(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${dayOffset(5)}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  await page.goto(
    `/meetings/${meeting.meetingId}/edit?${new URLSearchParams({ at: meeting.recurrenceId, scope: 'all' })}`,
  )
  const zone = page.locator('main [data-stop-zone]')
  await expect(zone.getByRole('button', { name: 'Delete this meeting' })).toBeVisible()

  const m = await measure(zone, 'main')
  const viewport = await page.evaluate(() => window.innerHeight)
  // On the floor of the main area, inside its own 20px of padding, as a project's edit page has it.
  expect(viewport - m.bottom).toBeLessThanOrEqual(21)
  // Last: everything on the page is above it.
  expect(m.contentBottom).toBeLessThanOrEqual(m.top + 0.5)
  // No fill of its own: it belongs to the page, and the rule sets it apart from the form.
  expect(m.fills).toEqual([CLEAR, CLEAR])
  expect(m.rule).toBeGreaterThan(0)
})

test('in a long edit, Delete follows the last field instead of floating over it', async ({
  page,
}) => {
  // Short enough that the edit's fields run past the pane's floor.
  await page.setViewportSize({ width: 1440, height: 600 })
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
  // Delete is the edit's last thing (FR-035), after the notes being edited.
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  const zone = dialog.locator('[data-stop-zone]')
  await expect(zone.getByRole('button', { name: 'Delete task' })).toBeAttached()

  // Before scrolling it is off screen, after the notes rather than pinned over them.
  const atTop = await measure(zone, '[role="dialog"]')
  expect(atTop.top).toBeGreaterThan(atTop.floor)
  expect(atTop.contentBottom).toBeLessThanOrEqual(atTop.top + 0.5)

  // Scrolled to the end, it sits on the floor with all the content above it.
  await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight))
  const atEnd = await measure(zone, '[role="dialog"]')
  expect(Math.abs(atEnd.floor - atEnd.bottom)).toBeLessThanOrEqual(1)
  expect(atEnd.contentBottom).toBeLessThanOrEqual(atEnd.top + 0.5)
  expect(atEnd.fills).toEqual([CLEAR, CLEAR])
})

test('on a short page, Delete project sits at the bottom of the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  await page.goto(`/projects/${pid}/edit`)
  const zone = page.locator('main [data-stop-zone]')
  await expect(zone.getByRole('button', { name: /^Delete / })).toBeVisible()

  const m = await measure(zone, 'main')
  const viewport = await page.evaluate(() => window.innerHeight)
  // On the floor of the main area, inside its own 20px of padding.
  expect(viewport - m.bottom).toBeLessThanOrEqual(21)
  expect(m.contentBottom).toBeLessThanOrEqual(m.top + 0.5)
  expect(m.fills).toEqual([CLEAR, CLEAR])
  expect(m.rule).toBeGreaterThan(0)
})

test('a held Enter on Delete does not also confirm it', async ({ page }) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Keep me' })
  await page.goto(`/people/${person.id}/edit`)
  const ask = page.getByRole('button', { name: /^Delete / })
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
