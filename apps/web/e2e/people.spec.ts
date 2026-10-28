import { expect, test, type Page } from '@playwright/test'
import {
  apiPost,
  lunarYear,
  makeProject,
  patchAnswered,
  pickLunarDay,
  pickOne,
  registerFreshUser,
} from './helpers'

/**
 * PEOPLE: a person's page reads them (FR-061); their edit page writes them (FR-063). Each way to
 * reach them is a link, phones are grouped as their country writes them and stored as E.164, and
 * a city is picked from the server's list.
 */
const add = (page: Page, data: Record<string, unknown>) => apiPost(page, '/people', data)
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'People' })
const contact = (page: Page) => page.getByRole('region', { name: 'Contact' })

/** Their edit page, its form drawn. */
async function edit(page: Page, id: string) {
  await page.goto(`/people/${id}/edit`)
  await expect(page.getByRole('textbox', { name: 'Given name', exact: true })).toBeVisible()
}
const save = (page: Page) => page.getByRole('button', { name: /^Save/ })

test('a person keeps several addresses, and each one is a link', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, {
    name: '陈颖',
    channels: [
      { kind: 'email', value: 'ying@acme.test', label: '工作' },
      { kind: 'phone', value: '+86 138 0000 0000' },
      { kind: 'url', value: 'github.com/ying' },
    ],
  })
  await page.goto(`/people/${made.id}`)
  await expect(contact(page).getByRole('link', { name: 'ying@acme.test' })).toHaveAttribute(
    'href',
    'mailto:ying@acme.test',
  )
  // The spacing a person writes a number with is not what a dialler takes.
  await expect(contact(page).getByRole('link', { name: '+86 138 0000 0000' })).toHaveAttribute(
    'href',
    'tel:+8613800000000',
  )
  // A bare host would otherwise link inside the app and go nowhere.
  await expect(contact(page).getByRole('link', { name: 'github.com/ying' })).toHaveAttribute(
    'href',
    'https://github.com/ying',
  )
  await expect(contact(page)).toContainText('工作')
})

test('an edit the server refuses stays open and says why', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: 'Refused' })
  await edit(page, made.id)
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('Refused again')
  await page.route(`**/api/v1/people/${made.id}`, (r) =>
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
  await save(page).click()
  await expect(page.getByRole('alert').filter({ hasText: 'That name is too long' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}/edit$`))
  await expect(page.getByRole('textbox', { name: 'Given name', exact: true })).toHaveValue(
    'Refused again',
  )
})

test('an address removed in the form is really gone', async ({ page }) => {
  // The failure mode of a replace-the-set write is an orphan nobody can delete.
  await registerFreshUser(page, '/people')
  const made = await add(page, {
    name: '韩梅梅',
    channels: [
      { kind: 'email', value: 'old@acme.test' },
      { kind: 'email', value: 'keep@acme.test' },
    ],
  })
  await edit(page, made.id)
  await page.getByRole('button', { name: 'Remove item 1' }).click()
  await save(page).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
  await expect(contact(page)).toContainText('keep@acme.test')
  await expect(contact(page)).not.toContainText('old@acme.test')
})

test('the sidebar lists everyone under the letter they are filed under, in pinyin order', async ({
  page,
}) => {
  await registerFreshUser(page, '/people')
  for (const name of ['王五', '李四', '张三', 'Lena Fischer', 'Ada Lovelace'])
    await add(page, { name })
  await page.reload()

  // Li is l, Wang is w, Zhang is z; Fischer is filed under F, Lovelace under L.
  await expect(sidebar(page).getByRole('heading', { level: 3 })).toHaveText(['F', 'L', 'W', 'Z'])
  await expect(
    sidebar(page).getByRole('region', { name: 'L' }).locator('[data-person-row]'),
  ).toHaveText([/李四/, /Ada Lovelace/])
  // A row is the way to the person, and says so while they are open.
  const li = sidebar(page).getByRole('link', { name: /李四/ })
  await li.click()
  await expect(page.getByRole('heading', { level: 1, name: '李四' })).toBeVisible()
  await expect(li).toHaveAttribute('aria-current', 'page')
})

test('a project page carries its people, in its People block (FR-055)', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, '找工作')
  await add(page, {
    name: '某招聘',
    projectIds: [pid],
    channels: [{ kind: 'email', value: 'r@acme.test' }],
  })
  await add(page, { name: '不相干的人' })
  await page.goto(`/projects/${pid}`)

  const people = page.getByRole('region', { name: 'People' })
  await expect(people).toContainText('某招聘')
  await expect(people).not.toContainText('不相干的人')
  // A person in a list is their avatar and their name (FR-049).
  await expect(people.locator('[data-linked]').first()).toContainText('某')
})

test('a person made from a project page is on that project', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, '找工作')
  await page.goto(`/projects/${pid}`)
  await page
    .getByRole('region', { name: 'People' })
    .getByRole('button', { name: 'New person' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/people/new\\?project=${pid}$`))
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('某招聘')
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/people',
  )
  await page.getByRole('button', { name: /^Create person/ }).click()
  expect((await made).request().postDataJSON()).toMatchObject({ projectIds: [pid] })
  await page.goto(`/projects/${pid}`)
  await expect(page.getByRole('region', { name: 'People' })).toContainText('某招聘')
})

test('search reaches a person by their address, from the shell box', async ({ page }) => {
  await registerFreshUser(page, '/')
  await add(page, { name: '陈颖', channels: [{ kind: 'email', value: 'ying@acme.test' }] })

  await page.getByRole('button', { name: /^Search everything/ }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('acme.test')
  await expect(
    page.getByRole('dialog', { name: 'Search' }).getByRole('option').filter({ hasText: '陈颖' }),
  ).toHaveCount(1)
})

test('Cancel drops the changes and writes nothing', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })
  await edit(page, made.id)
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('打错了')
  await page.getByRole('link', { name: 'Cancel' }).click()
  // Unsaved, so leaving asks first.
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: '陈颖' })).toBeVisible()
  expect(writes, 'Cancel 不该写任何东西').toEqual([])
})

test('after one save, the page reads what was just written', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await edit(page, made.id)
  await page.getByRole('textbox', { name: 'Notes' }).fill('Met at the meetup')
  await page.getByRole('combobox', { name: 'Hometown' }).fill('Chengdu')
  const written = patchAnswered(page, 'people/')
  await save(page).click()
  // One request carries both changes.
  expect((await written).request().postDataJSON()).toMatchObject({
    note: 'Met at the meetup',
    hometown: 'Chengdu',
  })
  await expect(page.getByRole('region', { name: 'Notes' })).toContainText('Met at the meetup')
  await expect(page.getByRole('region', { name: 'Places' })).toContainText('Chengdu')
})

test('leaving an edit for another person asks first, and then shows them', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const ann = await add(page, { name: 'Ann Alpha' })
  await add(page, { name: 'Bea Beta' })
  await edit(page, ann.id)
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('Ann changed')
  await sidebar(page)
    .getByRole('link', { name: /Bea Beta/ })
    .click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Bea Beta' })).toBeVisible()
  await expect(page.getByRole('form')).toHaveCount(0)
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
  await page
    .getByRole('main')
    .getByRole('button', { name: /^New person/ })
    .click()
  await expect(page).toHaveURL(/\/people\/new$/)
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('Refused person')
  await page.getByRole('button', { name: /^Create person/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'That name is too long' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Given name', exact: true })).toHaveValue(
    'Refused person',
  )
})

test('a new person can have a birthday and a circle, sent in one request', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const res = await page.request.put('/api/v1/people/circles', {
    data: { circles: [{ name: 'Family' }] },
    headers: { 'x-ctws-client': 'web' },
  })
  const family = ((await res.json()) as { circles: { id: string }[] }).circles[0]!.id
  await page.goto('/people/new')
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('外婆')
  // The birthday starts folded: a person is often just a name, and empty fields read as bad data.
  await page.getByRole('button', { name: 'Add a birthday' }).click()
  await lunarYear(page, '1944')
  await pickLunarDay(page, '十二月', '三十')
  await page.getByRole('button', { name: 'Family' }).click()

  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/people',
  )
  await page.getByRole('button', { name: /^Create person/ }).click()
  expect((await posted).request().postDataJSON()).toMatchObject({
    givenName: '外婆',
    circleIds: [family],
    birthday: { calendar: 'lunar', year: 1944, month: 12, day: 30 },
  })
})

/**
 * A long address is cut on the person's page, never widening the profile or the page: measured
 * once the page has settled (two reads the same), not on whichever frame happens to come first.
 */
test('a very long link is cut, and the profile does not widen at all', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const short = await add(page, {
    name: '短的',
    channels: [{ kind: 'email', value: 'a@b.test', label: null }],
  })
  const long = await add(page, {
    name: '长的',
    channels: [
      {
        kind: 'url',
        value: 'https://sites.google.com/site/hamzawaseem/home/publications-and-talks-2026',
        label: null,
      },
    ],
  })
  await page.setViewportSize({ width: 1280, height: 900 })
  const profile = page.getByRole('complementary', { name: 'Profile' })
  /** The profile's width once two reads 100 ms apart agree: the layout has stopped moving. */
  const settledWidth = async () => {
    let last = -1
    await expect
      .poll(async () => {
        const now = Math.round((await profile.boundingBox())!.width)
        const same = now === last
        last = now
        return same
      })
      .toBe(true)
    return last
  }
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  await page.goto(`/people/${short.id}`)
  await expect(contact(page)).toContainText('a@b.test')
  const narrow = await settledWidth()

  await page.goto(`/people/${long.id}`)
  const link = contact(page).locator('[data-channel="url"]')
  await expect(link).toContainText('sites.google.com')
  expect(await settledWidth()).toBe(narrow)
  expect(await overflow()).toBeLessThanOrEqual(0)
  // The address itself is the one cut, and its right edge stays inside the profile.
  const cut = await link.evaluate((a) => ({
    overflows: a.scrollWidth > a.clientWidth,
    right: Math.round(a.getBoundingClientRect().right),
    edge: Math.round(a.closest('aside')!.getBoundingClientRect().right),
  }))
  expect(cut.overflows).toBe(true)
  expect(cut.right).toBeLessThanOrEqual(cut.edge)

  // In a narrow window, a horizontal scrollbar is the first sign of a break.
  await page.setViewportSize({ width: 420, height: 900 })
  await expect(link).toBeVisible()
  await expect.poll(overflow).toBeLessThanOrEqual(0)
})

test('a person has a page at their address, and Back leaves it', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await page.reload()
  await sidebar(page).getByRole('link', { name: /陈颖/ }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
  await expect(page.getByRole('heading', { level: 1, name: '陈颖' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/people$/)
})

test('Delete is at the foot of the edit page, after the form, and asks first', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await page.goto(`/people/${made.id}`)
  await page.getByRole('link', { name: 'Edit' }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}/edit$`))
  const remove = page.getByRole('button', { name: /^Delete / })
  const after = await remove.evaluate((el) => {
    const notes = document.querySelector('[aria-label="Notes"]')!
    return (notes.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(after).toBe(true)
  await remove.click()
  await expect(page.getByRole('alertdialog', { name: 'Delete 陈颖' })).toBeVisible()
})

/** Addresses group as email, then phone, then link; written order holds only within a kind. */
test('addresses group by kind, not by the order they were written', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, {
    name: '陈颖',
    channels: [
      { kind: 'email', value: 'first@acme.test' },
      { kind: 'url', value: 'acme.test/ying' },
      { kind: 'email', value: 'second@acme.test' },
      { kind: 'phone', value: '+86 139 0000 1234' },
      { kind: 'url', value: 'github.com/ying' },
    ],
  })
  await page.goto(`/people/${made.id}`)
  await expect(contact(page).locator('dt')).toHaveText(['Email', 'Email', 'Phone', 'Link', 'Link'])
  // Within a kind, the one written first stays first; a link shows host and path.
  await expect(contact(page).locator('dd a')).toHaveText([
    'first@acme.test',
    'second@acme.test',
    '+86 139 0000 1234',
    'acme.test/ying',
    'github.com/ying',
  ])
})

test('a new address row is empty, with a placeholder showing its kind', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await edit(page, made.id)
  await page.getByRole('button', { name: 'Add one' }).click()
  const box = page.getByRole('textbox', { name: 'Item 1' })
  // Empty: a placeholder is not content, and only what a person types is saved.
  await expect(box).toHaveValue('')
  await expect(box).toHaveAttribute('placeholder', 'name@example.com')
  // Switched to phone, the placeholder follows: each kind is its own structured text.
  await pickOne(page.getByRole('region', { name: 'Ways to reach them' }), 'Type of item 1', 'Phone')
  await expect(box).toHaveAttribute('placeholder', '+86 139 0000 0000')
  // An empty row does not block Save: adding one and changing your mind is common.
  await expect(save(page)).toBeEnabled()
  await save(page).click()
  await expect(page).toHaveURL(new RegExp(`/people/${made.id}$`))
})

test('a value that does not fit its kind is called out before saving', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await edit(page, made.id)
  const ways = page.getByRole('region', { name: 'Ways to reach them' })
  await page.getByRole('button', { name: 'Add one' }).click()
  await pickOne(ways, 'Type of item 1', 'Phone')
  const box = page.getByRole('textbox', { name: 'Item 1' })

  // Nothing is said while typing: `+44` is unfinished, not wrong, and a disabled Save says enough.
  // Typed for real, because `fill()` moves focus away, which counts as leaving the box.
  await box.pressSequentially('+44')
  await expect(ways).not.toContainText('numbers are not that length')
  await expect(ways).not.toContainText('too short')

  await box.fill('')
  await box.pressSequentially('to fill in')
  await expect(ways).not.toContainText('a phone number is digits')
  await expect(save(page)).toBeDisabled()

  // Leaving the box says it, and says what is missing.
  await box.blur()
  await expect(ways).toContainText('a phone number is digits, spaces, dashes and brackets')

  // Pasted without a country code: said on leaving, and again it says what is missing.
  await box.fill('139 0000 1234')
  await box.blur()
  await expect(ways).toContainText('start with the country code, like +86')

  await box.fill('+86 139 0000 1234')
  await expect(ways).not.toContainText('start with the country code')
  await expect(save(page)).toBeEnabled()
})

test.describe(() => {
  // The pass below guesses a country code from the browser's region; pinned, so the guess is
  // the same on every machine.
  test.use({ locale: 'en-US' })

  // When the phone bundle arrives it formats the saved numbers in the form, but not what was typed:
  // a region guess would turn `139 0000 1234` into `+1 390 000 1234`, a different number.
  test('a late phone bundle does not rewrite what the person typed', async ({ page }) => {
    await registerFreshUser(page, '/people')
    const made = await add(page, {
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
    await edit(page, made.id)
    const ways = page.getByRole('region', { name: 'Ways to reach them' })
    // Retype a saved number: once typed, it is the person's own text.
    const box = page.getByRole('textbox', { name: 'Item 2' })
    await box.fill('139 0000 1234')
    await box.blur()
    await expect(ways).toContainText('start with the country code, like +86')

    release()
    // Arrived: the saved number is formatted.
    await expect(page.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+86 139 0000 1234')
    await expect(box).toHaveValue('139 0000 1234')
    await expect(ways).toContainText('start with the country code, like +86')
    await expect(save(page)).toBeDisabled()
  })
})

test('a phone number is formatted as typed, and saved in its normal form', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await edit(page, made.id)
  await page.getByRole('button', { name: 'Add one' }).click()
  await pickOne(page.getByRole('region', { name: 'Ways to reach them' }), 'Type of item 1', 'Phone')

  const box = page.getByRole('textbox', { name: 'Item 1' })
  // Switched to phone, the empty box already holds a country code: it is required.
  await expect(box).toHaveValue(/^\+\d+$/)
  // With a country code it takes the international form, as a number pasted from elsewhere would.
  await box.fill('+8613900001234')
  await expect(box).toHaveValue('+86 139 0000 1234')

  const written = patchAnswered(page, 'people/')
  await save(page).click()
  // Saved as E.164: no spaces, and one reading anywhere in the world.
  expect((await written).request().postDataJSON()).toMatchObject({
    channels: [{ kind: 'phone', value: '+8613900001234' }],
  })
  // Shown grouped on their page, computed from the saved value.
  await expect(contact(page).getByRole('link', { name: '+86 139 0000 1234' })).toBeVisible()
})

/**
 * Hometown and Lives in are cities from a list on the server (places of 15,000 people or more), so
 * one place is always written the same way.
 */
test('a city box suggests after a few letters, and saves the standard name', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await edit(page, made.id)
  const box = page.getByRole('combobox', { name: 'Lives in' })
  await box.fill('oxfo')
  const oxford = page.getByRole('button', { name: 'Oxford, England, United Kingdom' })
  await expect(oxford).toBeVisible()
  await oxford.click()
  await expect(box).toHaveValue('Oxford, England, United Kingdom')

  const written = patchAnswered(page, 'people/')
  await save(page).click()
  expect((await written).request().postDataJSON()).toMatchObject({
    city: 'Oxford, England, United Kingdom',
  })
  // Their page says the city and the country (M-05).
  await expect(page.getByRole('region', { name: 'Places' })).toContainText('Oxford, United Kingdom')
})

test('the city box says its list is open only while it is', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: 'Ying' })
  await edit(page, made.id)
  const box = page.getByRole('combobox', { name: 'Lives in' })

  await expect(box).toHaveAttribute('aria-expanded', 'false')
  await box.fill('oxfo')
  const oxford = page.getByRole('button', { name: 'Oxford, England, United Kingdom' })
  await expect(oxford).toBeVisible()
  await expect(box).toHaveAttribute('aria-expanded', 'true')
  // Leaving the box puts the list away; the box must say so too.
  await box.press('Tab')
  await expect(oxford).toHaveCount(0)
  await expect(box).toHaveAttribute('aria-expanded', 'false')
})

test('a misspelt city is flagged but can still be saved', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '陈颖' })
  await edit(page, made.id)
  await page.getByRole('combobox', { name: 'Hometown' }).fill('Oxforrd')
  await expect(page.getByRole('region', { name: 'Places and time' })).toContainText(
    'No city by that name',
  )
  // Not blocked: plenty of real places have fewer than 15,000 people.
  await expect(save(page)).toBeEnabled()
})

test('a new person refuses a number without a country code too', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.goto('/people/new')
  await page.getByRole('textbox', { name: 'Given name', exact: true }).fill('陈颖')
  const ways = page.getByRole('region', { name: 'Ways to reach them' })
  await pickOne(ways, 'Type of item 1', 'Phone')
  const box = page.getByRole('textbox', { name: 'Item 1' })
  // Typed for real: `fill()` moves focus away, which counts as leaving, and this is about staying.
  await box.fill('')
  await box.pressSequentially('13800000000')
  // No error while still in the box.
  await expect(ways).not.toContainText('start with the country code')
  await box.blur()
  await expect(ways).toContainText('start with the country code, like +86')
  await expect(page.getByRole('button', { name: /^Create person/ })).toBeDisabled()
})

/**
 * The form writes every address back, so a stored number that fails validation would block Save on
 * any edit, even to the name.
 */
test('an old stored number gains its country code when the form opens', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, {
    name: '陈颖',
    channels: [{ kind: 'phone', value: '+1 (730) 197-4443' }],
  })
  await edit(page, made.id)
  await expect(page.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+1 730 197 4443')
  await expect(save(page)).toBeEnabled()
})

test('opening the birthday and saving it untouched writes no birthday', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, { name: '没生日' })
  await edit(page, made.id)
  await page.getByRole('button', { name: 'Add a birthday' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Which calendar' })).toBeVisible()
  const saved = patchAnswered(page, `people/${made.id}`)
  await save(page).click()
  expect((await saved).request().postDataJSON()).not.toHaveProperty('birthday')
  const { people } = (await (await page.request.get('/api/v1/people')).json()) as {
    people: { id: string; birthday: unknown }[]
  }
  expect(people.find((p) => p.id === made.id)?.birthday).toBeNull()
})
