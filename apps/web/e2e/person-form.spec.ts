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
  await page.getByRole('button', { name: /^Shenzhen, Guangdong, China$/ }).click()
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
  await page.getByRole('button', { name: /^London, England, United Kingdom$/ }).click()
  await page.getByRole('button', { name: /^Save/ }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
  expect(await person(page, made.id)).toMatchObject({
    city: 'London, England, United Kingdom',
    timeZone: 'Asia/Tokyo',
    timeZoneSource: 'manual',
  })
})

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
