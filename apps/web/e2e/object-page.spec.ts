import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'
import { dayOffset } from './days'

/**
 * ONE PAGE FOR EVERY KIND OF THING.
 *
 * The shell draws ONE page for a project, a person and a meeting alike -- the module fills the
 * top, the shell fills the rest from the edge table, so the meetings a person was in and the book
 * they recommended show on their page -- and following a link from one lands on another.
 */

async function world(page: Page) {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  const person = await apiPost(page, '/people', {
    name: 'Ying Chen',
    org: 'Acme recruiting',
    projectIds: [project.id],
  })
  // A task, so the exclusion below is about a group that WOULD otherwise be there.
  await apiPost(page, '/tasks', { projectId: project.id, title: 'Rewrite the CV', parentId: null })
  const book = await apiPost(page, '/reading', {
    kind: 'book',
    title: 'The Design of Everyday Things',
  })
  await apiPost(page, '/relations', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    note: 'recommends',
  })
  const meeting = await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: `${dayOffset(5)}T21:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    projectId: project.id,
    attendeeIds: [person.id],
  })
  return { project, person, meeting }
}

/**
 * A person or a meeting opens as a layer over its list, not a page of its own: the module draws
 * the fields and the shell draws the links. A project keeps a whole page.
 */
test('a person’s layer shows the module’s fields and the shell’s links', async ({ page }) => {
  test.fixme(
    true,
    "Phase 3, STORY-021: a person's page shows module-owned links (meetings, projects) again.",
  )
  const { person } = await world(page)
  await page.goto(`/people/${person.id}`)

  const layer = page.getByRole('dialog', { name: 'People' })
  await expect(layer).toContainText('Ying Chen')
  await expect(layer).toContainText('Acme recruiting')

  // Read from the other end: attendees are stored on the meeting, the recommendation as a link.
  const linked = layer.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  await expect(linked.getByRole('region', { name: 'Reading' })).toContainText(
    'The Design of Everyday Things',
  )
  await expect(linked.getByRole('region', { name: 'Projects' })).toContainText('Job hunt')
})

test('following a link from a person to a meeting lands on the meeting’s layer', async ({
  page,
}) => {
  test.fixme(
    true,
    "Phase 3, STORY-021: a person's page shows module-owned links (meetings, projects) again.",
  )
  const { person, meeting } = await world(page)
  await page.goto(`/people/${person.id}`)
  await page.getByRole('link', { name: /Second interview/ }).click()

  await expect(page).toHaveURL(new RegExp(`/meetings/${meeting.meetingId}$`))
  await expect(page.getByRole('dialog', { name: 'Meetings' })).toContainText('Second interview')
  // The list stays behind the layer: after following a link, the next step is likely in it.
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()
})

test('the address of a person who is gone says so instead of showing nothing', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/99999999-9999-4999-8999-999999999999')
  await expect(page.getByText('This person is not here any more.')).toBeVisible()
})

test('Linked sits beside Tasks where the page has room, and below it on a phone', async ({
  page,
}) => {
  test.fixme(true, 'Phase 3, STORY-015: the project page shows module-owned items in Linked again.')
  const { project } = await world(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/projects/${project.id}`)
  // Both boxes in ONE frame, once the head above them has its name: two reads either side of the
  // name arriving put the two blocks 44px apart -- the name's own line -- and blamed the layout.
  await expect(page.locator('[data-project-sentence]')).toBeVisible()
  await expect(page.locator('[data-panel="Linked"]')).toContainText('Ying Chen')
  const boxes = () =>
    page.evaluate(() =>
      ['Tasks', 'Linked'].map((name) => {
        const r = document.querySelector(`[data-panel="${name}"]`)!.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
    )
  const [tasks, linked] = await boxes()
  // Beside: to the right of the tasks, and starting level with them.
  expect(linked!.x).toBeGreaterThanOrEqual(tasks!.x + tasks!.width)
  expect(Math.abs(linked!.y - tasks!.y)).toBeLessThan(40)
  expect(Math.round(linked!.width)).toBe(320)

  await page.setViewportSize({ width: 375, height: 800 })
  await expect
    .poll(async () => {
      const [narrowTasks, narrowLinked] = await boxes()
      return narrowLinked!.y - (narrowTasks!.y + narrowTasks!.height)
    })
    .toBeGreaterThan(-4)
})

/**
 * BELOW THE TASKS, ON THEIR EDGE. With the detail open (the third column is the detail's) and on a
 * phone, Linked goes under the tree -- and it is then one column with it: its rows' threads at the
 * tree's thread x and its headings where the Tasks heading hangs, not 72px to the left of them.
 */
test('with the detail open the third column is the detail’s, and Linked goes below on the tree’s edge', async ({
  page,
}) => {
  test.fixme(true, 'Phase 3, STORY-015: the project page shows module-owned items in Linked again.')
  const { project } = await world(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/projects/${project.id}`)
  await page.getByRole('listitem').filter({ hasText: 'Rewrite the CV' }).click()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  await expect(page.locator('[data-panel="Linked"]')).toContainText('Ying Chen')
  // One frame for every box: see the test above.
  const edges = () =>
    page.evaluate(() => {
      const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect()
      const tasks = box('[data-panel="Tasks"]')
      const linked = box('[data-panel="Linked"]')
      return {
        below: linked.y > tasks.y + tasks.height - 4,
        treeThread: Math.round(box('[data-task-tree] [data-thread]').x),
        linkedThread: Math.round(box('[data-panel="Linked"] [data-thread]').x),
        tasksHeading: Math.round(box('[data-panel="Tasks"] h2').x),
        linkedHeading: Math.round(box('[data-panel="Linked"] h3').x),
      }
    })
  const wide = await edges()
  expect(wide.below).toBe(true)
  expect(wide.linkedThread).toBe(wide.treeThread)
  expect(wide.linkedHeading).toBe(wide.tasksHeading)

  // And on a phone, where it is below for want of room.
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto(`/projects/${project.id}`)
  // Both reads, not just Linked's: the tree's can land second, and then it has no thread to measure.
  await expect(page.locator('[data-panel="Linked"]')).toContainText('Ying Chen')
  await expect(page.getByRole('listitem').filter({ hasText: 'Rewrite the CV' })).toBeVisible()
  const phone = await edges()
  expect(phone.below).toBe(true)
  expect(phone.linkedThread).toBe(phone.treeThread)
  expect(phone.linkedHeading).toBe(phone.tasksHeading)
})
