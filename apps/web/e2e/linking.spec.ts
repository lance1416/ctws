import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, registerFreshUser } from './helpers'
import { dayOffset } from './days'

/**
 * SAYING THAT TWO THINGS ARE CONNECTED, from the interface (FR-027): one action on anything, the
 * search box as its picker, and one optional line of why.
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

test('a book can be linked to the person who recommended it, with a line of why', async ({
  page,
}) => {
  const { person, book } = await world(page)
  await page.goto(`/people/${person.id}`)
  const recommended = page.getByRole('region', { name: 'Recommended reading' })
  await expect(recommended).toContainText('None from Ying yet')

  // L links anything to the thing whose page this is (FR-027).
  await page.getByRole('heading', { level: 1, name: 'Ying Chen' }).click()
  await page.keyboard.press('l')
  await picker(page).getByRole('combobox', { name: 'Search' }).fill('Everyday')
  await picker(page)
    .getByRole('option', { name: /The Design of Everyday Things/ })
    .click()

  // The one optional line; Enter sends it, and would send without it too.
  const why = page.getByRole('textbox', { name: 'Why' })
  await expect(why).toBeFocused()
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/relations$/.test(r.url()),
  )
  await why.fill('she recommended it')
  await why.press('Enter')
  expect((await made).request().postDataJSON()).toEqual({
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    note: 'she recommended it',
  })

  await expect(recommended).toContainText('The Design of Everyday Things')
  await expect(recommended).toContainText('she recommended it')
})

test('the edge reads from both ends, written once', async ({ page }) => {
  const { person, book } = await world(page)
  await apiPost(page, '/relations', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    note: 'recommends',
  })

  // Nothing was written on the BOOK, and the book's module has no page of its own -- so this is
  // read on the person, and on the reading list the item simply exists. One row, two readings.
  await page.goto(`/people/${person.id}`)
  const row = page.getByRole('region', { name: 'Recommended reading' })
  await expect(row).toContainText('The Design of Everyday Things')
  // Its line of why, read on this end as on the other.
  await expect(row).toContainText('recommends')
})

test('an edge is taken off from either end, whichever way it was written', async ({ page }) => {
  // The stored row runs one way. On the person's page the recommendation runs OUT of them and
  // the meeting they attend runs IN -- and unlinking has to name the ends the way the row has
  // them, or it deletes nothing and the row comes back on the next read.
  const { person, book } = await world(page)
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
  })
  await apiPost(page, '/relations', {
    from: { type: 'meeting', id: meeting.meetingId },
    to: { type: 'person', id: person.id },
  })

  await page.goto(`/people/${person.id}`)
  // INCOMING: this one was written from the meeting's end.
  await page.getByRole('button', { name: 'Unlink Second interview' }).click()
  const meetings = page.getByRole('region', { name: 'Meetings' })
  await expect(meetings).toContainText('None with Ying yet')
  // OUTGOING: the recommendation was written here.
  await page.getByRole('button', { name: 'Unlink The Design of Everyday Things' }).click()
  const recommended = page.getByRole('region', { name: 'Recommended reading' })
  await expect(recommended).toContainText('None from Ying yet')

  // And they are gone on the server, not just out of this render.
  await page.reload()
  await expect(meetings).toContainText('None with Ying yet')
  await expect(recommended).toContainText('None from Ying yet')
})

test('an edge can be taken off again, and the one a module owns cannot', async ({ page }) => {
  const { person, book } = await world(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  await apiPost(page, '/relations', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    note: 'recommends',
  })
  await apiPost(page, '/tasks', { projectId: project.id, title: 'Rewrite the CV', parentId: null })

  await page.goto(`/people/${person.id}`)
  const gone = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/api\/v1\/relations\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: 'Unlink The Design of Everyday Things' }).click()
  await gone
  await expect(page.getByRole('region', { name: 'Recommended reading' })).toContainText(
    'None from Ying yet',
  )

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
    startsLocal: `${dayOffset(5)}T21:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })

  await page.goto(`/people/${person.id}`)
  await page.getByRole('heading', { level: 1, name: 'Ying Chen' }).click()
  await page.keyboard.press('l')
  const list = picker(page).getByRole('option')
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
  await expect(pane.getByRole('region', { name: 'Linked' })).toContainText('None yet')

  await pane.getByRole('button', { name: 'Link something' }).click()
  await picker(page).getByRole('combobox', { name: 'Search' }).fill('Ying')
  await picker(page)
    .getByRole('option', { name: /Ying Chen/ })
    .click()
  // No line of why: Enter skips it.
  await page.getByRole('textbox', { name: 'Why' }).press('Enter')

  // A chip of the person's kind, by name (FR-056, artboard 8).
  await expect(pane.getByRole('region', { name: 'Linked' }).getByRole('link')).toHaveText(
    'Ying Chen',
  )

  // The person's side shows it too, in their Tasks: a link is read from both ends.
  await page.goto(`/people/${person.id}`)
  await expect(page.getByRole('region', { name: 'Tasks' })).toContainText('准备一面')
})

test('a task whose notes mention someone shows them by name, never the mention’s Markdown', async ({
  page,
}) => {
  const { person } = await world(page)
  const project = await apiPost(page, '/projects', { name: '找工作' })
  await apiPost(page, '/tasks', {
    title: 'Prepare the system design round',
    projectId: project.id,
    notes: `Ask [@Ying Chen](ctws://person/${person.id as string}) which questions came up.`,
  })
  await page.goto(`/projects/${project.id as string}`)
  await page.getByRole('listitem').filter({ hasText: 'Prepare the system design round' }).click()
  const linked = page
    .getByRole('dialog', { name: 'Task details' })
    .getByRole('region', { name: 'Linked' })
  // BUG-036: the name, whole; the sentence and its address stay out of the chip.
  await expect(linked.getByRole('link')).toHaveText('Ying Chen')
  await expect(linked).not.toContainText('ctws://')
  // A mention goes with its sentence: no × to unlink it here.
  await expect(linked.getByRole('button', { name: /^Unlink/ })).toHaveCount(0)
  // In the notes, the mention is the person's chip, not a link (I-03); it opens them beside.
  const chip = page.getByRole('dialog', { name: 'Task details' }).locator('[data-mention="person"]')
  await expect(chip).toHaveText('Ying Chen')
  await chip.click()
  await expect(page).toHaveURL(new RegExp(`inspect=person(%3A|:)${person.id as string}`))

  // The person's side: the task in their Tasks, by itself; the sentence on their timeline, the
  // name said plainly (M-01, M-06).
  await page.goto(`/people/${person.id as string}`)
  const tasks = page.getByRole('region', { name: 'Tasks' })
  await expect(tasks).toContainText('Prepare the system design round')
  await expect(tasks).not.toContainText('which questions')
  const timeline = page.getByRole('region', { name: 'Timeline' })
  await expect(timeline).toContainText('Ask Ying Chen which questions came up.')
  await expect(timeline).not.toContainText('ctws://')
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
  await apiPost(page, '/relations', {
    from: { type: 'task', id: task.id },
    to: { type: 'person', id: person.id },
    note: 'about',
  })
  await page.goto(`/people/${person.id}`)
  await page
    .getByRole('region', { name: 'Tasks' })
    .getByRole('link', { name: /准备一面/ })
    .click()

  // Its project's page, with the task's sheet open -- not the list of projects.
  await expect(page).toHaveURL(
    new RegExp(`/projects/${project.id as string}\\?.*task=${task.id as string}`),
  )
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText('准备一面')

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/people/${person.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Ying Chen' })).toBeVisible()
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
  await expect(page.getByRole('alert')).toContainText('This task was deleted')
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
  await expect(page.getByRole('alert')).toContainText('There is no such task.')
  await expect(page).toHaveURL(/\/tasks\/completed$/)
  expect(asked).toEqual([])
})

test('the task pages still answer on their own addresses', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/today')
  await expect(page.locator('#today-heading')).toBeVisible()
  await page.goto('/review')
  await expect(page.getByRole('heading', { level: 1, name: 'Review' })).toBeVisible()
})

test('a project’s Organisations + writes a new one down on it, and Remove takes it off', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  await page.goto(`/projects/${pid}`)
  const block = page.getByRole('region', { name: 'Organisations' })

  // FR-055: the list ends with a row that writes one down under the words typed, and links it.
  await block.getByRole('button', { name: 'Add an organisation' }).click()
  await picker(page).getByRole('combobox').fill('Stripe')
  await picker(page).getByRole('option', { name: 'New organisation “Stripe”' }).click()
  await expect(picker(page)).toHaveCount(0)
  // Written down on its own form, the name typed already there; made, it is linked and we are
  // back on the project (FR-055, FR-026).
  await expect(page).toHaveURL(new RegExp(`/organisations/new\\?project=${pid}$`))
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Stripe')
  await page.getByRole('button', { name: /^Create organisation/ }).click()
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
  await expect(block).toContainText('Stripe')

  await block.getByRole('button', { name: 'Remove Stripe from project' }).click()
  await expect(block).not.toContainText('Stripe')
})

test('choosing an organisation in the block puts it on the project, with no why (BUG-049)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await apiPost(page, '/organisations', { name: 'Morrow Legal' })
  const pid = await makeProject(page, 'Find a lawyer')
  await page.goto(`/projects/${pid}`)
  const block = page.getByRole('region', { name: 'Organisations' })
  await block.getByRole('button', { name: 'Add an organisation' }).click()
  await picker(page).getByRole('combobox').fill('Morrow')
  await picker(page)
    .getByRole('option', { name: /Morrow Legal/ })
    .click()
  await expect(picker(page)).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Why' })).toHaveCount(0)
  await expect(block).toContainText('Morrow Legal')
})
