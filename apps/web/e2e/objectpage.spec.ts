import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * ONE PAGE FOR EVERY KIND OF THING.
 *
 * A person's page did not exist: a person was a row with a pane over it, and the meetings they
 * were in, the book they recommended and the task that came out of a call with them had nowhere
 * to be shown. What is tested here is that the shell draws ONE page for a project, a person and a
 * meeting alike -- the module fills the top, the shell fills the rest from the edge table -- and
 * that following a link from one lands on another.
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
  await apiPost(page, '/links', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  const meeting = await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: '2026-10-20T21:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    projectId: project.id,
    attendeeIds: [person.id],
  })
  return { project, person, meeting }
}

/**
 * 一个人、一场会：**一层**，不是一个地方。
 *
 * 模块写它是什么，shell 写它连着什么 —— 这两半还是原来那两半，只是不再占掉整个窗口。项目保留
 * 整页：它是你工作的地方，有一棵会拖会折的任务树，而人和会议是你瞥一眼的记录。
 */
test('一个人的那一层里，模块写字段、shell 写边', async ({ page }) => {
  const { person } = await world(page)
  await page.goto(`/people/${person.id}`)

  const layer = page.getByRole('dialog', { name: 'People' })
  await expect(layer).toContainText('Ying Chen')
  await expect(layer).toContainText('Acme recruiting')

  // 边是从另一端读出来的：客人名单写在会议上，推荐写在一张表的一行里。
  const linked = layer.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  await expect(linked.getByRole('region', { name: 'Reading' })).toContainText(
    'The Design of Everyday Things',
  )
  await expect(linked.getByRole('region', { name: 'Projects' })).toContainText('Job hunt')
})

test('从一个人跟着边走到一场会，落点是会议的那一层', async ({ page }) => {
  const { person, meeting } = await world(page)
  await page.goto(`/people/${person.id}`)
  await page.getByRole('link', { name: /Second interview/ }).click()

  await expect(page).toHaveURL(new RegExp(`/meetings/${meeting.meetingId}$`))
  await expect(page.getByRole('dialog', { name: 'Meetings' })).toContainText('Second interview')
  // 列表就在后面：从一条边过来的人，下一步多半还在这个列表里。
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()
})

test('指向一个已经不在的人，说出来而不是空着', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/99999999-9999-4999-8999-999999999999')
  await expect(page.getByText('This person is not here any more.')).toBeVisible()
})

test('Linked sits beside Tasks where the page has room, and below it on a phone', async ({
  page,
}) => {
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
