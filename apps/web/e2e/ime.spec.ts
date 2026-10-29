import { expect, test, type Page } from '@playwright/test'
import { makeProject, registerFreshUser, captureBox, openCapture } from './helpers'

/**
 * ENTER WHILE AN IME IS COMPOSING IS NOT A SUBMIT.
 *
 * Typing English inside a Chinese IME and pressing Enter is how a lot of people type English: the
 * Enter commits the letters out of the candidate buffer. It must not also file the task or add the
 * person.
 *
 * The composition is driven here the way SAFARI dispatches it -- `compositionend` BEFORE the
 * `keydown` that caused it -- because that ordering is what defeats `KeyboardEvent.isComposing`
 * on its own.
 *
 * Each test records the writes the page sends, and then presses a real Enter: the one write that
 * follows proves the IME Enter was handled and dropped, not merely still in flight.
 */

/**
 * Types `text` into the focused element as an IME would, then presses Enter to commit it,
 * dispatching the events in Safari's order. The letters go in first and the page draws them, as
 * it would while someone types; only the Enter that commits them comes with `compositionend`.
 */
async function commitWithIme(page: Page, selector: string, text: string) {
  await page.locator(selector).focus()
  await page.evaluate(
    ([sel, value]) => {
      const el = document.querySelector(sel as string) as HTMLInputElement | HTMLTextAreaElement
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
      Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, value as string)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    [selector, text],
  )
  // Drawn: what the Enter sees is the text, as it is for a person.
  await expect(page.locator(selector)).toHaveValue(text)
  await page.evaluate(
    ([sel, value]) => {
      const el = document.querySelector(sel as string) as HTMLInputElement | HTMLTextAreaElement
      // Safari's order: the composition ends, and only THEN does the Enter arrive.
      el.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: value as string }),
      )
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    },
    [selector, text],
  )
}

/** Every write the page sends to the API, as `METHOD path`. */
function recordWrites(page: Page): string[] {
  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/v1/'))
      writes.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  return writes
}

const answered = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse(
    (r) => r.request().method() === method && path.test(new URL(r.url()).pathname) && r.ok(),
  )

test('committing English out of an IME does not file the capture', async ({ page }) => {
  await registerFreshUser(page)
  const writes = recordWrites(page)
  await openCapture(page)
  await commitWithIme(page, 'textarea[aria-label="Capture"]', 'hello')
  await expect(captureBox(page)).toHaveValue('hello')
  // Nothing sent for the IME's Enter: two frames are past any add it would have started.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
  expect(writes).toEqual([])

  const filed = answered(page, 'POST', /^\/api\/v1\/tasks$/)
  await captureBox(page).press('Enter')
  await filed
  await expect(page.getByText('Added to')).toBeVisible()
  expect(writes).toEqual(['POST /api/v1/tasks'])
})

test('committing English out of an IME does not create a task', async ({ page }) => {
  await registerFreshUser(page)
  const id = await makeProject(page, '改版')
  await page.goto(`/projects/${id}`)
  const writes = recordWrites(page)

  await commitWithIme(page, 'input[aria-label="New task"]', 'ship it')
  await expect(page.getByLabel('New task')).toHaveValue('ship it')
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
  expect(writes).toEqual([])

  const created = answered(page, 'POST', /^\/api\/v1\/tasks$/)
  await page.getByLabel('New task').press('Enter')
  await created
  await expect(page.getByRole('button', { name: 'Task: ship it', exact: true })).toHaveCount(1)
  expect(writes).toEqual(['POST /api/v1/tasks'])
})

test('committing English out of an IME does not add a person', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  const writes = recordWrites(page)

  // The Enter that commits the IME text is not the form's: nobody is added yet.
  await commitWithIme(page, 'input[id$="-given"]', 'Ada')
  await expect(page.getByLabel('Given name', { exact: true })).toHaveValue('Ada')
  expect(writes).toEqual([])

  const added = answered(page, 'POST', /^\/api\/v1\/people$/)
  await page.getByLabel('Given name', { exact: true }).press('ControlOrMeta+Enter')
  expect((await added).request().postDataJSON()).toMatchObject({ givenName: 'Ada' })
  expect(writes).toEqual(['POST /api/v1/people'])
})

test('committing a circle’s name out of an IME does not add the circle', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  await page.getByRole('button', { name: 'New circle' }).click()
  const writes = recordWrites(page)

  await commitWithIme(page, 'input[aria-label="New circle"]', '大学同学')
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
  expect(writes).toEqual([])

  const added = answered(page, 'PUT', /^\/api\/v1\/people\/circles$/)
  await page.getByLabel('New circle').press('Enter')
  await added
  expect(writes).toEqual(['PUT /api/v1/people/circles'])
})

/** Two frames: past anything an Enter just handled would have started or drawn. */
const settled = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))

test('committing out of an IME in New’s filter does not open what it names', async ({ page }) => {
  await registerFreshUser(page)
  const id = await makeProject(page, '改版')
  await page.goto(`/projects/${id}`)
  // The menu's button, named with its key: not New meeting and the like on the page.
  await page.getByRole('button', { name: /^New( N)?$/ }).click()
  await commitWithIme(page, 'input[aria-label="What to make"]', 'task')
  await settled(page)
  await expect(page.getByRole('dialog', { name: 'New task' })).toHaveCount(0)

  await page.getByLabel('What to make').press('Enter')
  await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible()
})

test('committing a month out of an IME does not read it yet', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/people/new')
  await page.getByRole('button', { name: 'Another role' }).click()
  const from = page.getByLabel('Role 1 from', { exact: true })

  await commitWithIme(page, 'input[aria-label="Role 1 from"]', 'mar 2021')
  await settled(page)
  // Read, it would be written out as "Mar 2021"; the IME's Enter leaves it as typed.
  await expect(from).toHaveValue('mar 2021')

  await from.press('Enter')
  await expect(from).toHaveValue('Mar 2021')
})

test('committing a zone out of an IME does not save it', async ({ page }) => {
  await registerFreshUser(page, '/account')
  const place = page.getByRole('region', { name: 'Time and place' })
  await place.getByRole('button', { name: 'Change' }).click()
  const writes = recordWrites(page)

  await commitWithIme(page, 'input[aria-label="Time zone"]', 'Asia/Tokyo')
  await settled(page)
  expect(writes).toEqual([])

  const saved = answered(page, 'PATCH', /^\/api\/v1\/auth\/me$/)
  await place.getByRole('combobox', { name: 'Time zone' }).press('Enter')
  await saved
  expect(writes).toEqual(['PATCH /api/v1/auth/me'])
})
