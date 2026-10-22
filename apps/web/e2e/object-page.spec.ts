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
  await expect(page.getByRole('heading', { name: 'This person was deleted' })).toBeVisible()
  // Nothing held a person, so the way on is People's overview (DES-001 section 4).
  await expect(page.getByText('It was in')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open People' }).click()
  await expect(page).toHaveURL(/\/people$/)
})

test('the project’s blocks sit beside the tree where the page has columns, under it where not', async ({
  page,
}) => {
  const { project } = await world(page)
  const tree = page.locator('[data-panel="Tasks"]')
  const people = page.getByRole('region', { name: 'People' })
  const box = (l: typeof tree) => l.evaluate((el) => el.getBoundingClientRect().toJSON())

  // The 27-inch screen: the tree takes half the columns, the blocks the rest (DES-001 section 4),
  // each column starting level with the tree.
  await page.setViewportSize({ width: 2560, height: 1310 })
  await page.goto(`/projects/${project.id}`)
  await expect(people).toContainText('Ying Chen')
  const wideTree = await box(tree)
  const side = await box(page.locator('[data-project-side]').first())
  expect(side.x).toBeGreaterThanOrEqual(wideTree.x + wideTree.width)
  expect(Math.abs(side.y - wideTree.y)).toBeLessThan(4)

  // With no column to spare, under the tree, two across, starting at its left edge.
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(page.locator('[data-project-under]')).toBeVisible()
  const narrowTree = await box(tree)
  const under = await box(page.locator('[data-project-under]'))
  expect(under.y).toBeGreaterThanOrEqual(narrowTree.y + narrowTree.height)
  expect(Math.round(under.x)).toBe(Math.round(narrowTree.x))

  // And on a phone, one column, still under the tree.
  await page.setViewportSize({ width: 375, height: 800 })
  await expect
    .poll(async () => (await box(people)).y - ((await box(tree)).y + (await box(tree)).height))
    .toBeGreaterThan(-4)
})

test('a project’s blocks: what is in it first, the empty ones as their heads, each + its own', async ({
  page,
}) => {
  const { project } = await world(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/projects/${project.id}`)
  const blocks = page.locator('[data-project-under] > section')
  await expect(page.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  // The meetings coming up and the people on it, in FR-055's order; then the empty ones, which
  // are their heads saying so.
  const names = await blocks.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))
  expect(names.slice(0, 2)).toEqual(['Meetings', 'People'])
  const reading = page.getByRole('region', { name: 'Reading' })
  await expect(reading).toContainText('None yet')
  expect(names.indexOf('Reading')).toBeGreaterThan(1)

  // The Meetings block's + makes a meeting, in this project.
  await page
    .getByRole('region', { name: 'Meetings' })
    .getByRole('button', { name: 'New meeting' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'New meeting' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Job hunt')
})
