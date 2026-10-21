import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  accountZone,
  apiPost,
  dayInZone,
  editDetail,
  makeProject,
  makeTask,
  registerFreshUser,
} from './helpers'
import { dayOffset } from './days'

/**
 * AN EDIT IS NOT THROWN AWAY BY A STRAY KEY. Escape, the scrim and the close button all ask first
 * when a person, a meeting or a reading item has unsaved changes, as a task's pane always has.
 */

const asked = (pane: Locator) => pane.getByRole('alert').filter({ hasText: 'unsaved changes' })

async function person(page: Page) {
  await registerFreshUser(page, '/people')
  const made = await apiPost(page, '/people', { name: 'Ying Chen' })
  await page.goto(`/people/${made.id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  return pane
}

test('Escape on an edited person asks, and Keep editing keeps the edit', async ({ page }) => {
  const pane = await person(page)
  const name = pane.getByLabel('Name', { exact: true })
  await name.fill('Ying Chen-Li')
  await name.press('Escape')

  await expect(asked(pane)).toBeVisible()
  await pane.getByRole('button', { name: 'Keep editing' }).click()
  await expect(pane).toBeVisible()
  await expect(name).toHaveValue('Ying Chen-Li')

  // And Discard is the way out when that is what was meant.
  await name.press('Escape')
  await pane.getByRole('button', { name: 'Discard changes' }).click()
  await expect(pane).toHaveCount(0)
})

test('Escape on a person form with nothing changed just closes', async ({ page }) => {
  const pane = await person(page)
  await pane.getByLabel('Name', { exact: true }).press('Escape')
  await expect(pane).toHaveCount(0)
})

test('a person whose phone is stored in an older spelling closes untouched without asking', async ({
  page,
}) => {
  await registerFreshUser(page, '/people')
  const made = await apiPost(page, '/people', {
    name: 'Ying Chen',
    channels: [{ kind: 'phone', value: '+86-138-0000-0000', label: null }],
  })
  await page.goto(`/people/${made.id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  // The phone module has had its turn: the number is shown settled.
  await expect(pane.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+86 138 0000 0000')
  await pane.getByLabel('Name', { exact: true }).press('Escape')
  await expect(pane).toHaveCount(0)
})

test('Escape on an edited meeting asks before throwing the edit away', async ({ page }) => {
  await registerFreshUser(page)
  const m = await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: `${dayOffset(5)}T18:00`,
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  await page.goto(`/meetings/${m.meetingId}`)
  const pane = page.getByRole('dialog', { name: 'Meetings' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  const title = pane.getByLabel('Title', { exact: true })
  await title.fill('Weekly sync')
  await title.press('Escape')

  await expect(asked(pane)).toBeVisible()
  await expect(title).toHaveValue('Weekly sync')
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
      await page.getByRole('button', { name: 'New…', exact: true }).click()
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
  [
    'New person',
    'Name',
    async (page) => {
      await page.goto('/people')
      await page
        .getByRole('main')
        .getByRole('button', { name: /^New person/ })
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
