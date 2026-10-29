import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser, WEB } from './helpers'

/**
 * WRITING A PERSON DOWN (FR-062, FR-063, artboard 11): every field in one page, the name's preview
 * as it is typed, their place in the sidebar marked New, Ctrl Enter from any field; the same form
 * edits them, and a city chosen by hand moves their zone unless the zone was set by hand.
 */
const box = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true })

async function person(page: Page, id: string) {
  const res = await page.request.get(`/api/v1/people/${id}`, { headers: WEB })
  expect(res.ok()).toBe(true)
  return res.json()
}

test('a person is written down in one page, and filed where the preview said', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  await expect(box(page, 'Given name')).toBeFocused()

  // Only the name is needed; without it nothing is sent.
  const posts: string[] = []
  page.on(
    'request',
    (r) => r.method() === 'POST' && r.url().endsWith('/people') && posts.push(r.url()),
  )
  await box(page, 'Given name').press('ControlOrMeta+Enter')
  await expect(page.getByText('Give them a name.')).toBeVisible()
  expect(posts).toHaveLength(0)

  await box(page, 'Given name').fill('雯')
  await box(page, 'Family name').fill('李')
  await expect(page.locator('[data-name-preview]')).toHaveText('Shown as 李雯. Sorted under L.')
  // The sidebar has their place already.
  const sidebar = page.getByRole('navigation', { name: 'People' })
  await expect(sidebar.getByRole('region', { name: 'L' })).toContainText('李雯New')

  await page.getByRole('button', { name: 'Another name' }).click()
  await box(page, 'Label of other name 1').fill('English name')
  await box(page, 'Other name 1').fill('Wendy Li')
  // A role at an organisation nobody has written down yet: it is added on Create.
  await page.getByRole('button', { name: 'Another role' }).click()
  await page.getByRole('combobox', { name: 'Organisation of role 1' }).fill('Tencent')
  await box(page, 'Role 1').fill('Product manager')

  const made = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/people\/[^/]+\/roles$/.test(r.url()) && r.ok(),
  )
  await box(page, 'Role 1').press('ControlOrMeta+Enter')
  const roles = await made
  const id = roles.url().split('/').at(-2)!
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
  await expect(page.getByRole('heading', { level: 1, name: '李雯' })).toBeVisible()
  await expect(sidebar.getByRole('region', { name: 'L' }).locator('[data-person-row]')).toHaveText([
    /李雯/,
  ])

  const saved = await person(page, id)
  expect(saved).toMatchObject({
    givenName: '雯',
    familyName: '李',
    aliases: [{ name: 'Wendy Li', label: 'English name' }],
    roles: [{ organisationName: 'Tencent', title: 'Product manager', to: null }],
  })
  // Found by the other name.
  const found = await page.request.get('/api/v1/people?q=Wendy', { headers: WEB })
  expect(((await found.json()) as { people: { id: string }[] }).people.map((p) => p.id)).toContain(
    id,
  )
})

test('the zone follows Lives in, until it is set by hand', async ({ page }) => {
  await registerFreshUser(page)
  const made = await apiPost<{ id: string }>(page, '/people', { name: '王磊' })
  await page.goto(`/people/${made.id}/edit`)

  const city = page.getByRole('combobox', { name: 'Lives in' })
  await city.fill('Shenzhen')
  await page.getByRole('option', { name: /^Shenzhen, Guangdong, China$/ }).click()
  await expect(page.getByText('Asia/Shanghai')).toBeVisible()
  await expect(page.getByText('From Lives in')).toBeVisible()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
  expect(await person(page, made.id)).toMatchObject({
    timeZone: 'Asia/Shanghai',
    timeZoneSource: 'city',
  })

  // Set by hand, the zone stays when the city changes (FR-063).
  await page.goto(`/people/${made.id}/edit`)
  await page.getByRole('button', { name: 'Change' }).click()
  await page.getByRole('combobox', { name: 'Time zone' }).fill('Tokyo')
  await page.getByRole('button', { name: 'Asia/Tokyo' }).click()
  await city.fill('London')
  await page.getByRole('option', { name: /^London, England, United Kingdom$/ }).click()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
  expect(await person(page, made.id)).toMatchObject({
    city: 'London, England, United Kingdom',
    timeZone: 'Asia/Tokyo',
    timeZoneSource: 'manual',
  })
})

for (const how of ['Done', 'Tab'] as const) {
  test(`a zone typed by hand is kept when the box is left by ${how} (BUG-048)`, async ({
    page,
  }) => {
    await registerFreshUser(page)
    const made = await apiPost<{ id: string }>(page, '/people', { name: '王磊' })
    await page.goto(`/people/${made.id}/edit`)
    await page.getByRole('combobox', { name: 'Lives in' }).fill('Shenzhen')
    await page.getByRole('option', { name: /^Shenzhen, Guangdong, China$/ }).click()
    await expect(page.getByText('From Lives in')).toBeVisible()

    await page.getByRole('button', { name: 'Change' }).click()
    const zone = page.getByRole('combobox', { name: 'Time zone' })
    await zone.fill('Asia/Tokyo')
    if (how === 'Done') await page.getByRole('button', { name: 'Done' }).click()
    else await zone.press('Tab')
    await expect(zone).toHaveCount(0)
    await expect(page.getByText('Asia/Tokyo')).toBeVisible()
    await expect(page.getByText('From Lives in')).toHaveCount(0)
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
    expect(await person(page, made.id)).toMatchObject({
      timeZone: 'Asia/Tokyo',
      timeZoneSource: 'manual',
    })
  })
}

test('Tab runs from the first field to Create person', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  await expect(box(page, 'Given name')).toBeFocused()
  const create = page.getByRole('button', { name: /^Create person/ })
  for (let i = 0; i < 60; i++) {
    if (await create.evaluate((el) => el === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(create).toBeFocused()
})

test('the birthday is out from the start, with nothing chosen until a day is (N-01)', async ({
  page,
}) => {
  await registerFreshUser(page, '/people')
  await page.goto('/people/new')
  const block = page.getByRole('region', { name: 'Birthday' })
  await expect(block.getByRole('radio', { name: 'Solar' })).toBeVisible()
  await expect(block.getByRole('button', { pressed: true })).toHaveCount(0)
  await expect(block).not.toContainText('Every year on')
  // A name and nothing else: no birthday is sent.
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('No birthday')
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/people',
  )
  await page.getByRole('button', { name: /^Create person/ }).click()
  expect((await made).request().postDataJSON()).not.toHaveProperty('birthday')
})

test('the organisation and city lists are chosen from with the keyboard (BUG-082)', async ({
  page,
}) => {
  await registerFreshUser(page)
  await apiPost(page, '/organisations', { name: 'Stripe' })
  await apiPost(page, '/organisations', { name: 'Stride Health' })
  await page.goto('/people/new')
  await box(page, 'Given name').fill('Ada')

  await page.getByRole('button', { name: 'Another role' }).click()
  const org = page.getByRole('combobox', { name: 'Organisation of role 1' })
  await org.fill('Stri')
  const list = page.getByRole('listbox')
  await expect(list.getByRole('option')).toHaveText([
    'Stride Health',
    'Stripe',
    'Add “Stri” as a new organisation',
  ])
  await expect(list.getByRole('option', { name: 'Stride Health' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await org.press('ArrowDown')
  await expect(list.getByRole('option', { name: 'Stripe' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  // Enter takes the one marked, and the form stays where it is.
  await org.press('Enter')
  await expect(page).toHaveURL(/\/people\/new$/)
  await expect(
    page.getByRole('button', { name: 'Organisation of role 1: Stripe. Change it' }),
  ).toBeVisible()

  const city = page.getByRole('combobox', { name: 'Lives in' })
  await city.fill('Lond')
  await expect(page.getByRole('option', { name: 'London, England, United Kingdom' })).toBeVisible()
  await city.press('ArrowDown')
  await city.press('ArrowUp')
  await city.press('Enter')
  await expect(page).toHaveURL(/\/people\/new$/)
  await expect(city).toHaveValue('London, England, United Kingdom')
  await expect(page.getByText('From Lives in')).toBeVisible()

  const made = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && /\/people\/[^/]+\/roles$/.test(r.url()) && r.ok(),
  )
  await city.press('ControlOrMeta+Enter')
  const id = (await made).url().split('/').at(-2)!
  expect(await person(page, id)).toMatchObject({
    city: 'London, England, United Kingdom',
    roles: [{ organisationName: 'Stripe' }],
  })
  // Choosing Stripe added nothing.
  const orgs = await page.request.get('/api/v1/organisations', { headers: WEB })
  expect(
    ((await orgs.json()) as { organisations: { name: string }[] }).organisations.map((o) => o.name),
  ).toEqual(['Stride Health', 'Stripe'])
})

test('a row added takes the typing, by key or by click (BUG-085)', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  await box(page, 'Given name').fill('Ada')

  await page.getByRole('button', { name: 'Another name' }).focus()
  await page.keyboard.press('Enter')
  await expect(box(page, 'Label of other name 1')).toBeFocused()
  // Typed into the box, never read as keys: N T opens no new task.
  await page.keyboard.type('Countess')
  await expect(box(page, 'Label of other name 1')).toHaveValue('Countess')
  await expect(page.getByRole('dialog', { name: 'New task' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Another role' }).click()
  await expect(page.getByRole('combobox', { name: 'Organisation of role 1' })).toBeFocused()

  await page.getByRole('button', { name: 'Another way' }).click()
  await expect(box(page, 'Item 2')).toBeFocused()
})
