import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * ONE PAGE FOR EVERY KIND OF THING.
 *
 * A person's page did not exist: a contact was a row with a pane over it, and the meetings they
 * were in, the book they recommended and the task that came out of a call with them had nowhere
 * to be shown. What is tested here is that the shell draws ONE page for a project, a person and a
 * meeting alike -- the module fills the top, the shell fills the rest from the edge table -- and
 * that following a link from one lands on another.
 */

async function world(page: Page) {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  const person = await apiPost(page, '/contacts', {
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
    from: { type: 'contact', id: person.id },
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

test('a person has a page, and it shows what nothing was ever written on them to say', async ({
  page,
}) => {
  const { person } = await world(page)
  await page.goto(`/contacts/${person.id}`)

  // The module fills the top: this is what a person IS.
  await expect(page.getByRole('region', { name: 'Person at a glance' })).toContainText('Ying Chen')
  await expect(page.getByRole('region', { name: 'Person at a glance' })).toContainText(
    'Acme recruiting',
  )

  // And the shell fills the rest, read from the OTHER end of edges written elsewhere: the guest
  // list was written on the meeting, the recommendation is one row in one table.
  const linked = page.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  await expect(linked.getByRole('region', { name: 'Reading' })).toContainText(
    'The Design of Everyday Things',
  )
  await expect(linked.getByRole('region', { name: 'Projects' })).toContainText('Job hunt')
})

test('following a link from a person lands on the meeting own page', async ({ page }) => {
  const { person, meeting } = await world(page)
  await page.goto(`/contacts/${person.id}`)
  await page.getByRole('link', { name: /Second interview/ }).click()

  await expect(page).toHaveURL(new RegExp(`/meetings/${meeting.meetingId}$`))
  await expect(page.getByRole('region', { name: 'Meeting at a glance' })).toContainText(
    'Second interview',
  )
  // The same page shape, the other way round: the meeting names who is in the room.
  await expect(
    page.getByRole('region', { name: 'Linked' }).getByRole('region', { name: 'People' }),
  ).toContainText('Ying Chen')
})

test('a project page keeps the tree, and everything else is an edge', async ({ page }) => {
  const { project } = await world(page)
  await page.goto(`/projects/${project.id}`)

  await expect(page.getByRole('region', { name: 'Project at a glance' })).toContainText('Job hunt')
  // A task tree is not a list of links -- no drag, no dependencies, no inline new row -- so the
  // task module keeps its block. It is the only one that does.
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()
  const linked = page.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'People' })).toContainText('Ying Chen')
  await expect(linked.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  // And the tasks are NOT said twice: the tree above is already the list of them.
  await expect(page.getByRole('region', { name: 'Tasks' })).toContainText('Rewrite the CV')
  await expect(linked.getByRole('region', { name: 'Tasks' })).toHaveCount(0)
})

test('a page for something that is gone says so rather than showing a blank', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/contacts/99999999-9999-4999-8999-999999999999')
  await expect(page.getByText('This person is not here any more.')).toBeVisible()
})

test('a pane reaches the page the thing lives on', async ({ page }) => {
  // A pane is a quick peek from wherever you were; the page is where the thing lives, with
  // everything it is connected to. The eyebrow is the way between them -- a pane opened from a
  // list would otherwise be a dead end, and the page unreachable except by a link from elsewhere.
  const { person } = await world(page)
  await page.goto('/contacts')
  await page.getByRole('button', { name: 'Ying Chen' }).click()
  const pane = page.getByRole('dialog', { name: 'Contacts' })
  await expect(pane).toBeVisible()

  await pane.getByRole('link', { name: 'Contacts' }).click()
  await expect(page).toHaveURL(new RegExp(`/contacts/${person.id}$`))
  await expect(page.getByRole('region', { name: 'Person at a glance' })).toContainText('Ying Chen')
})

test('1440 下一个人的 Linked 在右栏，不在正文下面', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const id = (await apiPost(page, '/contacts', { name: '周楠' })).id as string
  await page.goto(`/contacts/${id}`)
  const glance = page.getByRole('region', { name: 'Person at a glance' })
  const linked = page.getByRole('region', { name: 'Linked' })
  const [main, side] = await Promise.all([glance.boundingBox(), linked.boundingBox()])
  expect(main).not.toBeNull()
  expect(side).not.toBeNull()
  // Beside, not below: its left edge starts where the main column ends.
  expect(side!.x).toBeGreaterThan(main!.x + main!.width - 4)
  // And the main column is the wide one: two of three.
  expect(main!.width).toBeGreaterThan(side!.width * 1.5)
})

test('窄屏下还是一列，顺序不变', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page)
  const id = (await apiPost(page, '/contacts', { name: '周楠' })).id as string
  await page.goto(`/contacts/${id}`)
  const glance = await page.getByRole('region', { name: 'Person at a glance' }).boundingBox()
  const linked = await page.getByRole('region', { name: 'Linked' }).boundingBox()
  expect(linked!.y).toBeGreaterThan(glance!.y)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('项目页不被改成两栏：它自己的块已经把宽度用掉了', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = (await apiPost(page, '/projects', { name: '求职' })).id as string
  await page.goto(`/projects/${pid}`)
  const glance = (await page.getByRole('region', { name: 'Project at a glance' }).boundingBox())!
  const linked = (await page.getByRole('region', { name: 'Linked' }).boundingBox())!
  // Below, and the same width: the third column on this page belongs to the task detail pane.
  expect(linked.y).toBeGreaterThan(glance.y + glance.height - 4)
  expect(Math.round(linked.width)).toBe(Math.round(glance.width))
})
