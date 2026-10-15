import { expect, test, type Page } from '@playwright/test'
import { holdFirstRead, makeProject, pickOne, registerFreshUser, WEB } from './helpers'

/** People: a person has several ways to be reached, and each one is a link, not text to copy. */

const row = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name }).first()

/** The row's body: one link, to the person's own address. */
const personLink = (page: Page, name: string) =>
  page.locator('[data-person-row]').filter({ hasText: name }).getByRole('link')

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function add(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/v1/people', { headers: WEB, data })
  // Asserted, so a payload the contract refuses fails here and not as an empty list on the page.
  expect(res.status(), await res.text()).toBe(201)
  return res
}

test('a person keeps several addresses, and each one is a link', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, {
    name: '陈颖',
    org: 'Acme 招聘',
    channels: [
      { kind: 'email', value: 'ying@acme.test', label: '工作' },
      { kind: 'phone', value: '+86 138 0000 0000' },
      { kind: 'url', value: 'github.com/ying' },
    ],
  })
  const id = ((await made.json()) as { id: string }).id
  await page.goto(`/people/${id}`)

  // In the person's sheet: the list row says who they are, and the sheet how to reach them.
  const person = page.getByRole('dialog', { name: 'People' })
  await expect(person.getByRole('link', { name: 'ying@acme.test' })).toHaveAttribute(
    'href',
    'mailto:ying@acme.test',
  )
  // The spacing a person writes a number with is not what a dialler takes.
  await expect(person.getByRole('link', { name: '+86 138 0000 0000' })).toHaveAttribute(
    'href',
    'tel:+8613800000000',
  )
  // A bare host would otherwise link inside the app and go nowhere.
  await expect(person.getByRole('link', { name: 'github.com/ying' })).toHaveAttribute(
    'href',
    'https://github.com/ying',
  )
  await expect(person).toContainText('工作')
})

/** The refetch after the write must not reuse the first read, which left before the write. */
test('a person made while the list is still loading opens as themselves', async ({ page }) => {
  await registerFreshUser(page, '/')
  const release = await holdFirstRead(page, '**/api/v1/people')
  await page.goto('/people')
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/people$/.test(r.url()),
  )
  await page.getByLabel('Add a name').fill('李雷')
  await page.getByLabel('Add a name').press('Enter')
  await made
  release()
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('李雷')
  await expect(page.getByText('This person is not here any more.')).toHaveCount(0)
})

test('a person is made by typing a name, and finished in the pane', async ({ page }) => {
  // One line into a box, like every other thing this app makes.
  await registerFreshUser(page, '/people')
  await page.getByLabel('Add a name').fill('李雷')
  await page.getByLabel('Add a name').press('Enter')

  // The pane opens on them: a name alone is never all you know about somebody, and this is the
  // moment you have the rest of it to hand.
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane).toContainText('李雷')

  // While reading, Edit is the one visible way into the form.
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()
  await pane.getByRole('textbox', { name: 'Item 1' }).fill('lilei@acme.test')
  await pane.getByRole('button', { name: 'Save' }).click()

  await expect(pane).toContainText('lilei@acme.test')
  // Saving returns to reading, with what was just written in view.
  await expect(pane.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('an edit the server refuses stays open and says why', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: 'Refused' })
  const id = ((await made.json()) as { id: string }).id
  await page.goto(`/people/${id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByLabel('Name', { exact: true }).fill('Refused again')
  await page.route(`**/api/v1/people/${id}`, (r) =>
    r.request().method() === 'PATCH'
      ? r.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'That name is too long',
          }),
        })
      : r.continue(),
  )
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane.getByRole('alert')).toContainText('That name is too long')
  await expect(pane.getByLabel('Name', { exact: true })).toHaveValue('Refused again')
})

test('a person can be on several lines of work at once', async ({ page }) => {
  await registerFreshUser(page, '/')
  const hunt = await makeProject(page, '找工作')
  const ctws = await makeProject(page, 'CTWS')
  await add(page, { name: '陈颖' })
  await page.goto('/people')

  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  // Two picks in a row with no wait between: one save writes both, not just the last.
  for (const name of ['找工作', 'CTWS']) {
    await pane.getByRole('button', { name: 'Add Projects' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane).toContainText('找工作')
  await expect(pane).toContainText('CTWS')

  // On both lines, and found from either, under Linked.
  for (const pid of [hunt, ctws]) {
    await page.goto(`/projects/${pid}`)
    await expect(
      page.getByRole('region', { name: 'Linked' }).getByRole('region', { name: 'People' }),
    ).toContainText('陈颖')
  }
})

test('a line of work is taken off without touching the others', async ({ page }) => {
  await registerFreshUser(page, '/')
  const hunt = await makeProject(page, '找工作')
  const ctws = await makeProject(page, 'CTWS')
  await add(page, { name: '陈颖', projectIds: [hunt, ctws] })
  await page.goto('/people')

  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Remove Projects “找工作”' }).click()
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane).not.toContainText('找工作')
  await expect(pane).toContainText('CTWS')

  await page.goto(`/projects/${hunt}`)
  await expect(page.getByRole('region', { name: 'Linked' })).not.toContainText('陈颖')
})

test('an address removed in the pane is really gone', async ({ page }) => {
  // The failure mode of a replace-the-set write is an orphan nobody can delete.
  await registerFreshUser(page, '/people')
  await add(page, {
    name: '韩梅梅',
    channels: [
      { kind: 'email', value: 'old@acme.test' },
      { kind: 'email', value: 'keep@acme.test' },
    ],
  })
  await page.reload()

  await personLink(page, '韩梅梅').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Remove item 1' }).click()
  await pane.getByRole('button', { name: 'Save' }).click()

  await expect(pane).toContainText('keep@acme.test')
  await expect(pane).not.toContainText('old@acme.test')
})

// ------------------------------------------------------------------ the row: margin, thread, body

/**
 * The margin holds the next birthday with a cake, the thread is the first project, and the body
 * says who, with the city at the far end. The threads share one x with the page's heading.
 */
test('a person row hangs on the margin: next birthday, first project, then who they are', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  await page.setViewportSize({ width: 1440, height: 900 })
  const hunt = await makeProject(page, '找工作')
  const made = await add(page, {
    name: '陈颖',
    title: 'Engineering manager',
    org: 'Acme',
    city: 'Toronto',
    projectIds: [hunt],
    birthday: { calendar: 'solar', month: 3, day: 9 },
  })
  const ying = (await made.json()) as {
    id: string
    projects: { id: string }[]
    birthday: { next: { day: string } }
  }
  await add(page, { name: 'Lena Fischer', circle: 'friend' })
  await page.goto('/people')

  const yRow = page.locator(`[data-person-row="${ying.id}"]`)
  // The margin: the server's next birthday, month and day, beside the cake.
  const [, m, d] = ying.birthday.next.day.split('-').map(Number)
  await expect(yRow.locator('[data-birthday-lead] time')).toHaveText(`${MONTHS[m! - 1]} ${d}`)
  await expect(yRow.locator('[data-birthday-lead] [data-cake]')).toHaveCount(1)
  // The thread: their first line of work's.
  await expect(yRow.locator('[data-project-rail]')).toHaveAttribute(
    'data-project-rail',
    ying.projects[0]!.id,
  )
  // The body: one link to them, the initial, the name, what they do, and the city.
  const body = yRow.getByRole('link')
  await expect(body).toHaveAttribute('href', `/people/${ying.id}`)
  await expect(body.locator('[data-person-initial]')).toHaveText('陈')
  await expect(body.locator('[data-person-name]')).toHaveText('陈颖')
  // ...and the line of work the thread's colour stands for, by name: a colour is never alone.
  await expect(body.locator('[data-person-meta]')).toHaveText('Engineering manager, Acme · 找工作')
  const end = (await body.boundingBox())!
  const city = (await body.getByText('Toronto').boundingBox())!
  expect(end.x + end.width - (city.x + city.width), 'the city is at the far end').toBeLessThan(12)

  // Nothing to say is said with nothing: no birthday, no project, no job -- their circle instead.
  const lRow = page.locator('[data-person-row]').filter({ hasText: 'Lena Fischer' })
  await expect(lRow.locator('[data-birthday-lead] time')).toHaveCount(0)
  await expect(lRow.locator('[data-project-rail]')).toHaveCount(0)
  await expect(lRow.locator('[data-person-meta]')).toHaveText('Friend')

  // One x for the threads, and the page's heading hangs there too.
  const threads = await page
    .locator('[data-person-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(threads).toHaveLength(2)
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'People' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])

  // The open person's row says so.
  await body.click()
  await expect(page.getByRole('dialog', { name: 'People' })).toBeVisible()
  await expect(body).toHaveAttribute('aria-current', 'page')
})

test('the list is in pinyin order, not byte order', async ({ page }) => {
  await registerFreshUser(page, '/people')
  for (const name of ['王五', '李四', '张三']) await add(page, { name })
  await page.reload()

  // Li is l, Wang is w, Zhang is zh. By code point the three sort 张(24352) 李(26446) 王(29579).
  // `toHaveText` with an array, not `allTextContents`: the latter does not wait, so it reads an
  // empty list while the first fetch is still in flight.
  await expect(page.getByRole('main').locator('li [data-person-name]')).toHaveText([
    '李四',
    '王五',
    '张三',
  ])
})

test('a project page carries its people, as edges and not as a block of its own', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, '找工作')
  await add(page, {
    name: '某招聘',
    projectIds: [pid],
    channels: [{ kind: 'email', value: 'r@acme.test' }],
  })
  await add(page, { name: '不相干的人' })
  await page.goto(`/projects/${pid}`)

  const people = page
    .getByRole('region', { name: 'Linked' })
    .getByRole('region', { name: 'People' })
  await expect(people).toContainText('某招聘')
  await expect(people).not.toContainText('不相干的人')
  // No block, and so no second way to make a person from here: it is made on their own page. The
  // one region called People is the group inside Linked.
  await expect(page.getByRole('region', { name: 'People' })).toHaveCount(1)
  await expect(page.getByLabel('Add a name')).toHaveCount(0)
})

test('search reaches a person by their address, from the shell box', async ({ page }) => {
  await registerFreshUser(page, '/')
  await add(page, { name: '陈颖', channels: [{ kind: 'email', value: 'ying@acme.test' }] })

  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('acme.test')
  await expect(
    page.getByRole('dialog', { name: 'Search' }).getByRole('option').filter({ hasText: '陈颖' }),
  ).toHaveCount(1)
})

test('g n goes to the people, in the one keyspace', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/people$/)
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible()
})

test('Cancel drops the changes and writes nothing', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖', org: 'Acme 招聘' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })

  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('textbox', { name: 'Company' }).fill('打错了')
  await pane.getByRole('button', { name: 'Cancel' }).click()

  // Back to reading, with the old value, and the pane still open.
  await expect(pane).toBeVisible()
  await expect(pane).toContainText('Acme 招聘')
  await expect(pane).not.toContainText('打错了')
  expect(writes, 'Cancel 不该写任何东西').toEqual([])
})

test('after one save, the pane reads what was just written', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖', org: 'Acme 招聘' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })

  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('textbox', { name: 'Company' }).fill('新公司')
  await pane.getByRole('textbox', { name: 'Title' }).fill('技术负责人')
  const written = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/v1/people/'),
  )
  await pane.getByRole('button', { name: 'Save' }).click()

  // One request carries both changes.
  expect((await written).request().postDataJSON()).toMatchObject({
    org: '新公司',
    title: '技术负责人',
  })
  await expect(pane).toContainText('技术负责人 · 新公司')
})

test('switching people with an edit open shows the other person, not that edit', async ({
  page,
}) => {
  // Wide enough that the list stays usable beside the pane.
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page, '/people')
  await add(page, { name: 'Ann Alpha' })
  await add(page, { name: 'Bea Beta' })
  await page.goto('/people')
  await personLink(page, 'Ann Alpha').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByLabel('Name', { exact: true }).fill('Ann changed')
  await personLink(page, 'Bea Beta').click()
  await expect(pane.getByRole('heading', { name: 'Bea Beta' })).toBeVisible()
  await expect(pane.getByRole('form', { name: 'Edit person' })).toHaveCount(0)
})

test('a new person the server refuses says why, with the form still filled in', async ({
  page,
}) => {
  await registerFreshUser(page, '/people')
  await page.route('**/api/v1/people', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({
          status: 400,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'That name is too long',
          }),
        })
      : r.continue(),
  )
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('Refused person')
  await form.getByRole('button', { name: 'Create' }).click()
  await expect(form.getByRole('alert')).toContainText('That name is too long')
  await expect(form.getByLabel('Name')).toHaveValue('Refused person')
})

test('a person is written down properly in one form, not created then edited', async ({ page }) => {
  // A name alone is rarely all you know. The one-line box stays for the moment it is; this is
  // the other moment, and it must not mean create-then-open-to-edit.
  await registerFreshUser(page, '/people')
  const hunt = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await hunt.json()) as { id: string }).id

  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('Ying Chen')
  await form.getByLabel('Company').fill('Acme recruiting')
  await form.getByLabel('Address').fill('ying@acme.test')
  await form.getByLabel('Notes').fill('Met at the meetup')
  await form.getByRole('button', { name: 'Add Projects' }).click()
  await page.getByRole('menuitem', { name: 'Job hunt' }).click()

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/people$/.test(r.url()),
  )
  await form.getByRole('button', { name: 'Create' }).click()

  // One request carries the whole person.
  expect((await made).request().postDataJSON()).toMatchObject({
    name: 'Ying Chen',
    org: 'Acme recruiting',
    note: 'Met at the meetup',
    projectIds: [projectId],
    channels: [{ kind: 'email', value: 'ying@acme.test', label: null }],
  })
  await expect(row(page, 'Ying Chen')).toContainText('Acme recruiting')
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('ying@acme.test')
})

test('the whole row opens the person', async ({ page }) => {
  // The whole row is the target, not just the four characters of a name.
  await registerFreshUser(page, '/people')
  await add(page, { name: 'Ying Chen', org: 'Acme recruiting' })
  await page.reload()

  // Not the name: the organisation, which is as far from the name as the row gets.
  await row(page, 'Ying Chen').getByText('Acme recruiting').click()
  await expect(page.getByRole('dialog', { name: 'People' })).toBeVisible()
})

/**
 * The short-field grid: its width, its column count, and how far each label sits below its cell's
 * top. A label drifts when a taller neighbour stretches the row and the cell centres its content.
 */
async function fieldGrid(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-person-fields]')
    if (!grid) return null
    const cells = [...grid.children]
    const left = cells[0]?.getBoundingClientRect().left ?? 0
    return {
      width: Math.round(grid.getBoundingClientRect().width),
      // Distinct left edges: one per column.
      columns: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left))).size,
      firstLeft: Math.round(left),
      drift: cells.map((cell) => {
        const label = cell.querySelector('span')
        return {
          label: label?.textContent ?? '?',
          off: Math.round(
            (label?.getBoundingClientRect().top ?? 0) - cell.getBoundingClientRect().top,
          ),
        }
      }),
    }
  })
}

/** The column count for the grid's own width, not the window's. */
const PAIR_AT = 576
const TRIPLE_AT = 672
const columnsFor = (width: number) => (width >= TRIPLE_AT ? 3 : width >= PAIR_AT ? 2 : 1)

test("the short fields' columns follow their own width, not the window's", async ({ page }) => {
  await registerFreshUser(page, '/people')
  const projectIds: string[] = []
  for (const name of ['Job hunt', 'CTWS', '开源维护', 'Reading group']) {
    const made = await page.request.post('/api/v1/projects', { headers: WEB, data: { name } })
    projectIds.push(((await made.json()) as { id: string }).id)
  }
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', projectIds, org: 'Acme' },
  })
  const id = ((await made.json()) as { id: string }).id

  // A wide window but a pane of about 400px: viewport breakpoints would give three columns here.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/people/${id}`)
  await expect(page.getByText('Lives in')).toBeVisible()
  const wide = await fieldGrid(page)
  expect(wide!.width).toBeLessThan(TRIPLE_AT)
  expect(wide!.columns).toBe(columnsFor(wide!.width))
  // With Projects on two lines, the cell beside it does not drift down to their middle.
  expect(wide!.drift.filter((d) => d.off > 6)).toEqual([])

  // A narrow window: the pane fills the screen, and its own width still decides.
  await page.setViewportSize({ width: 420, height: 900 })
  await expect(page.getByText('Lives in')).toBeVisible()
  const narrow = await fieldGrid(page)
  expect(narrow!.columns).toBe(columnsFor(narrow!.width))
  expect(narrow!.drift.filter((d) => d.off > 6)).toEqual([])
})

test('a new person can have a birthday and a circle, sent in one request', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('外婆')
  // The birthday starts folded: a person is often just a name, and empty fields read as bad data.
  await form.getByRole('button', { name: 'Add a birthday' }).click()
  await form
    .getByRole('group', { name: 'Which calendar' })
    .getByRole('button', { name: 'Lunar' })
    .click()
  await form.getByRole('textbox', { name: 'Year' }).fill('1944')
  await pickOne(form, 'Lunar month', '十二月')
  await pickOne(form, 'Lunar day', '三十')
  await pickOne(form, 'Circle', 'Family')

  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/people',
  )
  await form.getByRole('button', { name: 'Create' }).click()
  expect((await posted).request().postDataJSON()).toMatchObject({
    name: '外婆',
    circle: 'family',
    birthday: { calendar: 'lunar', year: 1944, month: 12, day: 30 },
  })
  // Made here, the person opens in this page's pane; one made on Birthdays goes to their address.
  await expect(page.getByText('农历甲申年十二月三十')).toBeVisible()
})

/**
 * The layout sets the pane's width, never its content: a wider pane would scroll the whole list
 * sideways.
 */
test('a very long link is truncated, and the pane does not widen at all', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const short = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '短的', channels: [{ kind: 'email', value: 'a@b.test', label: null }] },
  })
  await page.request.post('/api/v1/people', {
    headers: WEB,
    data: {
      name: '长的',
      channels: [
        {
          kind: 'url',
          value: 'https://sites.google.com/site/hamzawaseem/home/publications-and-talks-2026',
          label: null,
        },
      ],
    },
  })
  expect(short.ok()).toBe(true)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/people')
  await page.getByText('短的').first().click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane).toBeVisible()
  const narrow = (await pane.boundingBox())!.width

  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByText('长的').first().click()
  await expect(pane).toBeVisible()
  await expect(pane.getByText('sites.google.com')).toBeVisible()
  expect((await pane.boundingBox())!.width).toBe(narrow)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  // Measure the address itself: the pane can hold its width by overflowing while the text runs past
  // its cell.
  const clipped = await pane.evaluate((root) => {
    const a = [...root.querySelectorAll('[data-channels] a')].find((el) =>
      (el.textContent ?? '').includes('sites.google.com'),
    ) as HTMLElement | undefined
    if (!a) return null
    return {
      overflows: a.scrollWidth > a.clientWidth,
      right: Math.round(a.getBoundingClientRect().right),
      edge: Math.round(root.getBoundingClientRect().right),
    }
  })
  expect(clipped).not.toBeNull()
  // The long address is the one truncated, and its right edge stays inside the pane.
  expect(clipped!.overflows).toBe(true)
  expect(clipped!.right).toBeLessThanOrEqual(clipped!.edge)

  // The same address in a narrow window, where a horizontal scrollbar is the first sign of a break.
  await page.setViewportSize({ width: 420, height: 900 })
  await expect(pane.getByText('sites.google.com')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
  await page.setViewportSize({ width: 1280, height: 900 })

  // The same while editing: the long address in a text box does not widen the pane either.
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Item 1' })
    .fill('https://sites.google.com/site/hamzawaseem/home/publications-and-talks-2026-really-long')
  expect((await pane.boundingBox())!.width).toBe(narrow)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
})

/**
 * `/people/<id>` is the list with the person's pane over it, as `/tasks/<id>` is: a link has an
 * address to go to, and the list keeps its filter and scroll behind the pane.
 */
test("a pasted link lands on the list with the person's pane open", async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', org: 'Acme recruiting' },
  })
  await page.request.post('/api/v1/people', { headers: WEB, data: { name: '周楠' } })
  const id = ((await made.json()) as { id: string }).id

  await page.goto(`/people/${id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane).toBeVisible()
  await expect(pane).toContainText('陈颖')
  // The list is behind it, not an empty page.
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
  await expect(personLink(page, '周楠')).toBeVisible()
  // There is no separate full page to go to.
  await expect(page.getByRole('link', { name: 'Open as a page' })).toHaveCount(0)

  // Closing returns to the list, and the URL with it.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page).toHaveURL(/\/people$/)
  await expect(pane).toHaveCount(0)
})

test('opening a person from the list puts their address in the URL', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', { headers: WEB, data: { name: '陈颖' } })
  const id = ((await made.json()) as { id: string }).id
  await page.reload()
  await personLink(page, '陈颖').click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
  // Back is the browser's back, since opening the pane was a navigation.
  await page.goBack()
  await expect(page).toHaveURL(/\/people$/)
})

test('the pane has Linked, and Delete at the very end', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const hunt = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await hunt.json()) as { id: string }).id
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', projectIds: [projectId] },
  })
  const id = ((await made.json()) as { id: string }).id

  await page.goto(`/people/${id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane.getByText('Linked')).toBeVisible()
  await expect(pane.getByRole('link', { name: 'Job hunt' })).toBeVisible()

  // Delete is the last thing in the pane. It is pinned to the bottom on screen, so this compares
  // document order, not coordinates.
  const remove = pane.getByRole('button', { name: 'Delete person' })
  const after = await remove.evaluate((el) => {
    const linked = document.querySelector('[aria-label="Linked"]')!
    return (linked.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(after).toBe(true)
  await remove.click()
  // It asks first.
  await expect(pane.getByRole('button', { name: /Delete|Confirm/ }).first()).toBeVisible()
})

/** Addresses group as email, then phone, then link; written order holds only within a kind. */
test('addresses group by kind, not by the order they were written', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: {
      name: '陈颖',
      channels: [
        { kind: 'email', value: 'first@acme.test' },
        { kind: 'url', value: 'acme.test/ying' },
        { kind: 'email', value: 'second@acme.test' },
        { kind: 'phone', value: '+86 139 0000 1234' },
        { kind: 'url', value: 'github.com/ying' },
      ],
    },
  })
  const id = ((await made.json()) as { id: string }).id
  await page.goto(`/people/${id}`)
  await expect(page.locator('[data-channels] li')).toHaveCount(5)
  const kinds = await page.locator('[data-channels] li span:first-child').allTextContents()
  expect(kinds).toEqual(['Email', 'Email', 'Phone', 'Link', 'Link'])
  // Within a kind, the one written first stays first.
  const rows = await page.locator('[data-channels] li a').allTextContents()
  expect(rows[0]).toBe('first@acme.test')
  expect(rows[1]).toBe('second@acme.test')
  // A link shows host and path, not the whole URL.
  expect(rows[3]).toBe('acme.test/ying')
})

test('a new address row is empty, with a placeholder showing its kind', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()

  const box = pane.getByRole('textbox', { name: 'Item 1' })
  // Empty: a placeholder is not content, and only what a person types is saved.
  await expect(box).toHaveValue('')
  await expect(box).toHaveAttribute('placeholder', 'name@example.com')

  // Switched to phone, the placeholder follows: each kind is its own structured text.
  await pickOne(pane, 'Type of item 1', 'Phone')
  await expect(box).toHaveAttribute('placeholder', '+86 139 0000 0000')

  // An empty row does not block Save: adding one and changing your mind is common.
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('a value that does not fit its kind is called out before saving', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()
  await pickOne(pane, 'Type of item 1', 'Phone')
  const box = pane.getByRole('textbox', { name: 'Item 1' })

  // Nothing is said while typing: `+44` is unfinished, not wrong, and a disabled Save says enough.
  // Typed for real, because `fill()` moves focus away, which counts as leaving the box.
  await box.pressSequentially('+44')
  await expect(pane).not.toContainText('numbers are not that length')
  await expect(pane).not.toContainText('too short')

  await box.fill('')
  await box.pressSequentially('to fill in')
  await expect(pane).not.toContainText('a phone number is digits')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeDisabled()

  // Leaving the box says it, and says what is missing.
  await box.blur()
  await expect(pane).toContainText('a phone number is digits, spaces, dashes and brackets')

  // Pasted without a country code: said on leaving, and again it says what is missing.
  await box.fill('139 0000 1234')
  await box.blur()
  await expect(pane).toContainText('start with the country code, like +86')

  await box.fill('+86 139 0000 1234')
  await expect(pane).not.toContainText('start with the country code')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test.describe(() => {
  // The pass below guesses a country code from the browser's region; pinned, so the guess is
  // the same on every machine.
  test.use({ locale: 'en-US' })

  // When the phone bundle arrives it formats the saved numbers in the form, but not what was typed:
  // a region guess would turn `139 0000 1234` into `+1 390 000 1234`, a different number.
  test('a late phone bundle does not rewrite what the person typed', async ({ page }) => {
    await registerFreshUser(page, '/people')
    await add(page, {
      name: '陈颖',
      channels: [
        { kind: 'phone', value: '+8613900001234' },
        { kind: 'phone', value: '+8613800000000' },
      ],
    })
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/assets/phone-*.js', async (route) => {
      await held
      await route.continue()
    })
    await page.reload()
    await personLink(page, '陈颖').click()
    const pane = page.getByRole('dialog', { name: 'People' })
    await pane.getByRole('button', { name: 'Edit', exact: true }).click()
    // Retype a saved number: once typed, it is the person's own text.
    const box = pane.getByRole('textbox', { name: 'Item 2' })
    await box.fill('139 0000 1234')
    await box.blur()
    await expect(pane).toContainText('start with the country code, like +86')

    release()
    // Arrived: the saved number is formatted.
    await expect(pane.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+86 139 0000 1234')
    await expect(box).toHaveValue('139 0000 1234')
    await expect(pane).toContainText('start with the country code, like +86')
    await expect(pane.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

test('a phone number is formatted as typed, and saved in its normal form', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()
  await pickOne(pane, 'Type of item 1', 'Phone')

  const box = pane.getByRole('textbox', { name: 'Item 1' })
  // Switched to phone, the empty box already holds a country code: it is required, and an empty box
  // would not say so.
  await expect(box).toHaveValue(/^\+\d+$/)

  // With a country code it takes the international form, as a number pasted from elsewhere would.
  await box.fill('+8613900001234')
  await expect(box).toHaveValue('+86 139 0000 1234')

  const written = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/v1/people/'),
  )
  await pane.getByRole('button', { name: 'Save' }).click()
  // Saved as E.164: no spaces, and one reading anywhere in the world.
  expect((await written).request().postDataJSON()).toMatchObject({
    channels: [{ kind: 'phone', value: '+8613900001234' }],
  })
  // Shown grouped, computed from the saved value rather than the saved value itself.
  await expect(pane.getByRole('link', { name: '+86 139 0000 1234' })).toBeVisible()
  // The same in the list: how a number looks does not depend on which box it came from.
  await page.reload()
  await expect(page.getByRole('link', { name: '+86 139 0000 1234' }).first()).toBeVisible()
})

/**
 * Hometown and Lives in are cities from a list on the server (places of 15,000 people or more), so
 * one place is always written the same way.
 */
test('a city box suggests after a few letters, and saves the standard name', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  await pane.getByLabel('Lives in').fill('oxfo')
  await expect(pane.getByRole('button', { name: 'Oxford, England, United Kingdom' })).toBeVisible()
  await pane.getByRole('button', { name: 'Oxford, England, United Kingdom' }).click()
  await expect(pane.getByLabel('Lives in')).toHaveValue('Oxford, England, United Kingdom')

  const written = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/v1/people/'),
  )
  await pane.getByRole('button', { name: 'Save' }).click()
  expect((await written).request().postDataJSON()).toMatchObject({
    city: 'Oxford, England, United Kingdom',
  })
})

test('the city box says its list is open only while it is', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: 'Ying' })
  await page.reload()
  await personLink(page, 'Ying').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  const box = pane.getByRole('combobox', { name: 'Lives in' })

  await expect(box).toHaveAttribute('aria-expanded', 'false')
  await box.fill('oxfo')
  await expect(pane.getByRole('button', { name: 'Oxford, England, United Kingdom' })).toBeVisible()
  await expect(box).toHaveAttribute('aria-expanded', 'true')
  // Leaving the box puts the list away; the box must say so too.
  await box.press('Tab')
  await expect(pane.getByRole('button', { name: 'Oxford, England, United Kingdom' })).toHaveCount(0)
  await expect(box).toHaveAttribute('aria-expanded', 'false')
})

test('a misspelt city is flagged but can still be saved', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  await pane.getByLabel('Hometown').fill('Oxforrd')
  await expect(pane).toContainText('No city by that name')
  // Not blocked: plenty of real places have fewer than 15,000 people.
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test('the New person dialog formats a number too, and saves the same value', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('陈颖')
  await pickOne(form, 'Kind', 'Phone')

  const box = form.getByLabel('Address')
  // The country code is already in the box: a required part is shown up front, not after Create.
  await expect(box).toHaveValue(/^\+\d+$/)
  await box.fill('+8613800000000')
  await expect(box).toHaveValue('+86 138 0000 0000')

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/people$/.test(r.url()),
  )
  await form.getByRole('button', { name: 'Create' }).click()
  expect((await made).request().postDataJSON()).toMatchObject({
    channels: [{ kind: 'phone', value: '+8613800000000' }],
  })

  // Grouped in the list and in the pane alike.
  await expect(page.getByRole('link', { name: '+86 138 0000 0000' }).first()).toBeVisible()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane.getByRole('link', { name: '+86 138 0000 0000' })).toBeVisible()
})

test('the New person dialog refuses a number without a country code too', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('陈颖')
  await pickOne(form, 'Kind', 'Phone')
  // Typed for real: `fill()` moves focus away, which counts as leaving, and this is about staying.
  await form.getByLabel('Address').fill('')
  await form.getByLabel('Address').pressSequentially('13800000000')

  // No error while still in the box.
  await expect(form).not.toContainText('start with the country code')
  await form.getByLabel('Address').blur()
  await expect(form).toContainText('start with the country code, like +86')
  await expect(form.getByRole('button', { name: 'Create' })).toBeDisabled()
})

/**
 * The form writes every address back, so a stored number that fails validation would block Save on
 * any edit, even to the name.
 */
test('an old stored number gains its country code when the form opens', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', channels: [{ kind: 'phone', value: '+1 (730) 197-4443' }] },
  })
  expect(made.ok()).toBe(true)
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  await expect(pane.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+1 730 197 4443')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
})

/** On a phone the margin is 60px: a birthday's date stays inside it, and so the page's edge. */
test('a birthday fits the phone margin', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, '/')
  // May 28: the widest month-and-day the margin has to hold, on any day the suite runs.
  await add(page, { name: '陈颖', birthday: { calendar: 'solar', month: 5, day: 28 } })
  await page.goto('/people')
  const lead = page.locator('[data-person-row] [data-birthday-lead]')
  await expect(lead.locator('time')).toHaveText('May 28')
  expect(await lead.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
})
