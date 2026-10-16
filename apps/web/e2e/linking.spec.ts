import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * SAYING THAT TWO THINGS ARE CONNECTED, from the interface.
 *
 * "This book is the one Ying recommended" is written from the app itself, not only from a module's
 * own field.
 */
const picker = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Link to' })

async function world(page: Page) {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Ying Chen', org: 'Acme recruiting' })
  const book = await apiPost(page, '/reading', {
    kind: 'book',
    title: 'The Design of Everyday Things',
  })
  return { person, book }
}

test('a book can be marked as the one someone recommended', async ({ page }) => {
  const { person, book } = await world(page)
  await page.goto(`/people/${person.id}`)
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  await page.getByRole('button', { name: '+ Link' }).click()
  await picker(page).getByLabel('Search').fill('Everyday')
  await picker(page)
    .getByRole('button', { name: /The Design of Everyday Things/ })
    .click()

  // The SECOND question, which cannot be guessed: a person and a book can be joined two ways.
  await expect(page.getByRole('dialog').filter({ hasText: 'How is it related?' })).toBeVisible()
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/links$/.test(r.url()),
  )
  await page.getByRole('button', { name: 'recommended', exact: true }).click()
  expect((await made).request().postDataJSON()).toEqual({
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })

  const linked = page.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'Reading' })).toContainText(
    'The Design of Everyday Things',
  )
})

test('the edge reads from both ends, written once', async ({ page }) => {
  const { person, book } = await world(page)
  await apiPost(page, '/links', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })

  // Nothing was written on the BOOK, and the book's module has no page of its own -- so this is
  // read on the person, and on the reading list the item simply exists. One row, two readings.
  await page.goto(`/people/${person.id}`)
  const row = page.getByRole('region', { name: 'Reading' })
  await expect(row).toContainText('The Design of Everyday Things')
  await expect(row).toContainText('recommended')
})

test('an edge is taken off from either end, whichever way it was written', async ({ page }) => {
  // The stored row runs one way. On the person's page the recommendation runs OUT of them and
  // the meeting they attend runs IN -- and unlinking has to name the ends the way the row has
  // them, or it deletes nothing and the row comes back on the next read.
  const { person, book } = await world(page)
  await apiPost(page, '/links', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: '2026-10-20T21:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    attendeeIds: [person.id],
  })

  await page.goto(`/people/${person.id}`)
  // INCOMING: the guest list was written on the meeting.
  await page.getByRole('button', { name: 'Unlink Second interview' }).click()
  await expect(page.getByRole('region', { name: 'Meetings' })).toHaveCount(0)
  // OUTGOING: the recommendation was written here.
  await page.getByRole('button', { name: 'Unlink The Design of Everyday Things' }).click()
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  // And they are gone on the server, not just out of this render.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')
})

test('an edge can be taken off again, and the one a module owns cannot', async ({ page }) => {
  const { person, book } = await world(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  await apiPost(page, '/links', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  await apiPost(page, '/tasks', { projectId: project.id, title: 'Rewrite the CV', parentId: null })

  await page.goto(`/people/${person.id}`)
  const gone = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/api\/v1\/links\?/.test(r.url()),
  )
  await page.getByRole('button', { name: 'Unlink The Design of Everyday Things' }).click()
  await gone
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  // A task's project is a NOT NULL column its own module keeps. Unlinking it would mean a task
  // belonging to nothing, so the row shows and the control does not.
  await page.goto(`/projects/${project.id}`)
  await expect(page.getByRole('region', { name: 'Tasks' })).toContainText('Rewrite the CV')
  await expect(page.getByRole('button', { name: /^Unlink/ })).toHaveCount(0)
})

test('the picker offers every kind of thing, and never the object itself', async ({ page }) => {
  const { person } = await world(page)
  await apiPost(page, '/projects', { name: 'Job hunt' })
  await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: '2026-10-20T21:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })

  await page.goto(`/people/${person.id}`)
  await page.getByRole('button', { name: '+ Link' }).click()
  const list = picker(page).getByRole('listitem')
  // One box, four kinds of thing, each saying which it is -- two titles can read the same.
  await expect(list.filter({ hasText: 'Second interview' })).toContainText('Meeting')
  await expect(list.filter({ hasText: 'Job hunt' })).toContainText('Project')
  await expect(list.filter({ hasText: 'The Design of Everyday Things' })).toContainText('Reading')
  // Not themselves: a thing is not related to itself, whatever the kind.
  await expect(list.filter({ hasText: 'Ying Chen' })).toHaveCount(0)
})

test('a task can be linked to a person, and both ends show the link', async ({ page }) => {
  const { person } = await world(page)
  const project = await apiPost(page, '/projects', { name: '找工作' })
  await apiPost(page, '/tasks', { title: '准备一面', projectId: project.id })
  await page.goto(`/projects/${project.id as string}`)
  await page.getByRole('listitem').filter({ hasText: '准备一面' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await expect(pane).toBeVisible()
  await expect(pane.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  await pane.getByRole('button', { name: '+ Link' }).click()
  await picker(page).getByLabel('Search').fill('Ying')
  await picker(page)
    .getByRole('button', { name: /Ying Chen/ })
    .click()
  await page.getByRole('button', { name: 'about', exact: true }).click()

  await expect(pane.getByRole('region', { name: 'Linked' })).toContainText('Ying Chen')

  // The person's side shows it too: a link is read from both ends.
  await page.goto(`/people/${person.id}`)
  await expect(
    page.getByRole('dialog', { name: 'People' }).getByRole('region', { name: 'Linked' }),
  ).toContainText('准备一面')
})

// ------------------------------------------------------------------- a task's sheet has an address

test('opening a task puts it in the address, and a reload opens it again', async ({ page }) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: '找工作' })
  const task = await apiPost(page, '/tasks', { title: '准备一面', projectId: project.id })
  await page.goto(`/projects/${project.id as string}`)
  await page.getByRole('listitem').filter({ hasText: '准备一面' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id as string}\\?.*task=${task.id as string}`),
  )

  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('准备一面')

  // Closing takes it out of the address, and Back brings the sheet back.
  await page
    .getByRole('dialog', { name: 'Task details' })
    .getByRole('button', { name: 'Close' })
    .click()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toHaveCount(0)
  await expect(page).not.toHaveURL(/task=/)
  await page.goBack()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
})

test('a task linked to a person opens on its own sheet, and Back returns to the person', async ({
  page,
}) => {
  const { person } = await world(page)
  const project = await apiPost(page, '/projects', { name: '找工作' })
  const task = await apiPost(page, '/tasks', { title: '准备一面', projectId: project.id })
  await apiPost(page, '/links', {
    from: { type: 'task', id: task.id },
    to: { type: 'person', id: person.id },
    kind: 'about',
  })
  await page.goto(`/people/${person.id}`)
  const personPane = page.getByRole('dialog', { name: 'People' })
  await personPane
    .getByRole('region', { name: 'Linked' })
    .getByRole('link', { name: /准备一面/ })
    .click()

  // Its project's page, with the task's sheet open -- not the list of projects.
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id as string}\\?.*task=${task.id as string}`),
  )
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('准备一面')

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/people/${person.id}$`))
  await expect(page.getByRole('dialog', { name: 'People' })).toBeVisible()
})

/**
 * A link to a task that cannot be followed says WHY: "not here any more" only when the server says
 * there is no such task, and that it could not be reached when it could not.
 */
test('a task link that fails for another reason does not say the task is gone', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = '00000000-0000-4000-8000-000000000000'
  await page.route(`**/api/v1/tasks/${id}`, (r) => r.fulfill({ status: 503, body: '{}' }))
  await page.goto(`/tasks/${id}`)
  await expect(page.getByRole('alert')).toContainText("Couldn't open this task")
  await page.unroute(`**/api/v1/tasks/${id}`)
  await page.goto(`/tasks/${id}`)
  await expect(page.getByRole('alert')).toContainText('This task is not here any more.')
})

test('a task address opens the task in its project', async ({ page }) => {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Addressed' })
  const task = await apiPost(page, '/tasks', { title: 'Find me', projectId: project.id })
  await page.goto(`/tasks/${task.id as string}`)
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id as string}\\?task=${task.id as string}$`),
  )
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('Find me')
})

test('an address that is no task id says so, and asks the server nothing', async ({ page }) => {
  // Not Today: its Done panel reads that very list.
  await registerFreshUser(page, '/projects')
  const asked: string[] = []
  page.on('request', (r) => {
    if (/\/api\/v1\/tasks\/completed/.test(r.url())) asked.push(r.url())
  })
  // `completed` is not a task id: under /api/v1/tasks it names a list, so it is never fetched.
  await page.goto('/tasks/completed')
  await expect(page.getByRole('alert')).toContainText('This task is not here any more.')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  expect(asked).toEqual([])
})

test('the task pages still answer on their own addresses', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/tasks/today')
  await expect(page.locator('#today-heading')).toBeVisible()
  await page.goto('/tasks/review')
  await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible()
})
