import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  accountZone,
  apiPost,
  dayInZone,
  editDetail,
  makeProject,
  makeTask,
  registerFreshUser,
  openNewTask,
} from './helpers'
import { dayOffset } from './days'

/**
 * AN EDIT IS NOT THROWN AWAY BY A STRAY KEY. Escape, the scrim and the close button all ask first
 * when a person, a meeting or a reading item has unsaved changes, as a task's pane always has.
 */

const asked = (pane: Locator) => pane.getByRole('alert').filter({ hasText: 'unsaved changes' })

/** A person's edit page, open; a person is edited on a page, not in a pane (FR-063). */
async function person(page: Page, channels: object[] = []) {
  await registerFreshUser(page, '/people')
  const made = await apiPost(page, '/people', { name: 'Ying Chen', channels })
  await page.goto(`/people/${made.id}/edit`)
  await expect(page.getByLabel('Given name', { exact: true })).toBeVisible()
  return made.id as string
}

test('leaving an edited person asks, and Keep editing keeps the edit', async ({ page }) => {
  const id = await person(page)
  const main = page.getByRole('main')
  const name = page.getByLabel('Given name', { exact: true })
  await name.fill('Yan')
  await page.getByRole('link', { name: 'Cancel' }).click()

  await expect(asked(main)).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}/edit$`))
  await expect(name).toHaveValue('Yan')

  // And Discard is the way out when that is what was meant.
  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
})

test('leaving a person form with nothing changed just goes', async ({ page }) => {
  const id = await person(page)
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
})

test('a person whose phone is stored in an older spelling is left untouched without asking', async ({
  page,
}) => {
  const id = await person(page, [{ kind: 'phone', value: '+86-138-0000-0000', label: null }])
  // The phone module has had its turn: the number is shown settled.
  await expect(page.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+86 138 0000 0000')
  await page.getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
})

test('leaving an edited meeting asks, and Keep editing keeps the edit', async ({ page }) => {
  // A meeting is edited on a page (FR-068), guarded as a person's is.
  await registerFreshUser(page)
  const m = await apiPost<{ meetingId: string; recurrenceId: string }>(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${dayOffset(5)}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  const occurrence = new URLSearchParams({ at: m.recurrenceId })
  await page.goto(`/meetings/${m.meetingId}/edit?${occurrence}&scope=all`)
  const main = page.getByRole('main')
  const title = page.getByLabel('Title', { exact: true })
  await title.fill('Weekly sync')
  await main.getByRole('button', { name: 'Cancel', exact: true }).click()

  await expect(asked(main)).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page).toHaveURL(new RegExp(`/meetings/${m.meetingId}/edit`))
  await expect(title).toHaveValue('Weekly sync')

  // And Discard is the way out when that is what was meant.
  await main.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Weekly')
})

test('the scrim on an edited reading item asks before throwing the edit away', async ({ page }) => {
  // Below 1280 the pane is an overlay with a scrim.
  await page.setViewportSize({ width: 1024, height: 800 })
  await registerFreshUser(page)
  const item = await apiPost(page, '/reading', { kind: 'book', title: 'The C book' })
  await page.goto(`/reading/${item.id}`)
  const pane = page.getByRole('dialog', { name: 'Reading' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  const title = pane.getByLabel('Title', { exact: true })
  await title.fill('The C Programming Language')
  await page.locator('[data-detail-backdrop]').click({ position: { x: 10, y: 10 } })

  await expect(asked(pane)).toBeVisible()
  await expect(title).toHaveValue('The C Programming Language')
})

for (const where of ['Today', 'Done'] as const) {
  test(`opening another task beside an edited one on ${where} asks first`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await registerFreshUser(page)
    const pid = await makeProject(page, 'P')
    const today = dayInZone(await accountZone(page))
    const fields = where === 'Today' ? { scheduledOn: today } : { status: 'done' }
    await makeTask(page, pid, 'First task', fields)
    await makeTask(page, pid, 'Second task', fields)
    await page.goto(where === 'Today' ? '/today' : '/review?view=done')

    await page.getByRole('main').getByText('First task').click()
    const pane = page.getByRole('dialog', { name: 'Task details' })
    await editDetail(page)
    await pane.getByRole('textbox', { name: 'Title' }).fill('First task, renamed')
    await page.getByRole('main').getByText('Second task').click()

    await expect(asked(pane)).toBeVisible()
    await pane.getByRole('button', { name: 'Keep editing' }).click()
    await expect(pane.getByRole('textbox', { name: 'Title' })).toHaveValue('First task, renamed')
  })
}

const newDialogs: [string, string, (page: Page) => Promise<unknown>][] = [
  [
    'New task',
    'Title',
    async (page) => {
      const pid = await makeProject(page, 'P')
      await page.goto(`/projects/${pid}`)
      await openNewTask(page)
    },
  ],
  [
    'New meeting',
    'Title',
    async (page) => {
      await page.goto('/meetings')
      await page
        .getByRole('main')
        .getByRole('button', { name: /^New meeting/ })
        .first()
        .click()
    },
  ],
]

for (const [name, field, open] of newDialogs) {
  test(`Escape and the scrim on a typed-in ${name} dialog ask first`, async ({ page }) => {
    await registerFreshUser(page)
    await open(page)
    const dialog = page.getByRole('dialog', { name })
    const box = dialog.getByLabel(field, { exact: true })
    await box.fill('Half typed')

    await box.press('Escape')
    await expect(asked(dialog)).toBeVisible()
    await dialog.getByRole('button', { name: 'Keep editing' }).click()
    await expect(box).toHaveValue('Half typed')

    await page.mouse.click(5, 5)
    await expect(asked(dialog)).toBeVisible()
    await dialog.getByRole('button', { name: 'Discard changes' }).click()
    await expect(dialog).toHaveCount(0)
  })
}
