import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'
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
