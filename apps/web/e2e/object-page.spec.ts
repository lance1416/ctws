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
 * A meeting and a person each have a page of their own (FR-061, FR-067). The module draws the
 * fields and the shell draws the links. A project keeps a whole page.
 */
test('a person’s page shows the module’s fields and what they are in', async ({ page }) => {
  const { person } = await world(page)
  await page.goto(`/people/${person.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Ying Chen' })).toBeVisible()

  // Read from the other end: attendees are stored on the meeting, the recommendation as a link,
  // the project on the person (FR-061).
  await expect(page.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  await expect(page.getByRole('region', { name: 'Recommended reading' })).toContainText(
    'The Design of Everyday Things',
  )
  await expect(page.getByRole('link', { name: 'Job hunt' })).toBeVisible()
})

test('a meeting from a person opens beside them, and its full page is the meeting’s', async ({
  page,
}) => {
  const { person, meeting } = await world(page)
  await page.goto(`/people/${person.id}`)
  await page.getByRole('link', { name: /Second interview/ }).click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector.getByRole('heading', { name: 'Second interview' })).toBeVisible()
  await inspector.getByRole('button', { name: 'Open full page' }).click()

  await expect(page).toHaveURL(new RegExp(`/meetings/${meeting.meetingId}(\\?|$)`))
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(
    'Second interview',
  )
  // And the way back: the person is among those attending, a link to their page.
  await expect(
    page.getByRole('complementary', { name: 'Profile' }).getByRole('link', { name: /Ying Chen/ }),
  ).toHaveAttribute('href', `/people/${person.id}`)
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

  // A block whose + links rather than makes names one of its kind (BUG-037); people and
  // organisations are found first and put on the project (FR-055).
  await expect(
    page.getByRole('region', { name: 'Organisations' }).getByRole('button', {
      name: 'Add an organisation',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'People' }).getByRole('button', { name: 'Add a person' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Notes' }).getByRole('button', { name: 'Link a note' }),
  ).toBeVisible()

  // The Meetings block's + makes a meeting, in this project.
  await page
    .getByRole('region', { name: 'Meetings' })
    .getByRole('button', { name: 'New meeting' })
    .click()
  const dialog = page.getByRole('dialog', { name: 'New meeting' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Job hunt')
  // FR-026: made from the page's block, it stays on the page and shows in that block.
  await dialog.getByLabel('Title').fill('Onsite')
  await dialog.getByLabel('Date').fill(dayOffset(1))
  await dialog.getByLabel('Start time').fill('10:00')
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id as string}$`))
  await expect(page.getByRole('region', { name: 'Meetings' })).toContainText('Onsite')

  // And N P on the page: New person is a page of its own (FR-062), and the person it makes is the
  // project's.
  await page.keyboard.press('n')
  await page.keyboard.press('p')
  await expect(page).toHaveURL(new RegExp(`/people/new\\?project=${project.id as string}$`))
  await page.getByLabel('Given name', { exact: true }).fill('Priya')
  await page.getByLabel('Family name', { exact: true }).fill('Nair')
  await page.getByRole('button', { name: /^Create person/ }).click()
  // Made from the project, it goes back there (FR-026).
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id as string}$`))
  await expect(page.getByRole('region', { name: 'People' })).toContainText('Priya Nair')
})
