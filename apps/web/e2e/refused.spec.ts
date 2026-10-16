import { expect, test, type Page } from '@playwright/test'
import { apiPost, logOut, makeProject, registerFreshUser } from './helpers'

/**
 * A WRITE THE SERVER REFUSES SAYS SO. The button comes back either way; without a word beside it,
 * the person cannot tell a refusal from a write that never went out.
 */

const SAID = 'The server said no to this one'

/** The next `method` to `url` is refused with a problem+json that names itself. */
async function refuse(page: Page, url: string, method: string) {
  await page.route(url, (r) =>
    r.request().method() === method
      ? r.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Internal Server Error',
            status: 500,
            detail: SAID,
          }),
        })
      : r.continue(),
  )
}

const said = (page: Page) => page.getByRole('alert').filter({ hasText: SAID })

test('a project delete the server refuses says so, and the page stays', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '删不掉')
  await page.goto(`/projects/${pid}`)
  await refuse(page, `**/api/v1/projects/${pid}`, 'DELETE')
  await page.getByRole('button', { name: 'Delete project' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(said(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
})

test('a meeting cancel the server refuses says so', async ({ page }) => {
  await registerFreshUser(page)
  const m = await apiPost(page, '/meetings', {
    title: 'Weekly',
    startsLocal: '2026-12-01T18:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })
  await page.goto(`/meetings/${m.meetingId}`)
  const pane = page.getByRole('dialog', { name: 'Meetings' })
  await refuse(page, `**/api/v1/meetings/${m.meetingId}?*`, 'DELETE')
  await pane.getByRole('button', { name: 'Cancel meeting' }).click()
  await pane.getByRole('button', { name: 'Cancel meeting' }).click()
  await expect(said(page)).toBeVisible()
  await expect(pane).toBeVisible()
})

test('a reading row whose move the server refuses says so', async ({ page }) => {
  await registerFreshUser(page)
  const item = await apiPost(page, '/reading', { kind: 'book', title: '设计心理学' })
  await page.goto('/reading')
  await refuse(page, `**/api/v1/reading/${item.id}`, 'PATCH')
  await page
    .getByRole('listitem')
    .filter({ hasText: '设计心理学' })
    .first()
    .getByRole('button', { name: 'Start reading' })
    .click()
  await expect(said(page)).toBeVisible()
})

test('a person delete the server refuses says so, and the pane stays', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const person = await apiPost(page, '/people', { name: 'Ying Chen' })
  await page.goto(`/people/${person.id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await refuse(page, `**/api/v1/people/${person.id}`, 'DELETE')
  await pane.getByRole('button', { name: 'Delete person' }).click()
  await pane.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(said(page)).toBeVisible()
  await expect(pane).toBeVisible()
})

test('a reading delete the server refuses says so, and the pane stays', async ({ page }) => {
  await registerFreshUser(page)
  const item = await apiPost(page, '/reading', { kind: 'book', title: 'The C book' })
  await page.goto(`/reading/${item.id}`)
  const pane = page.getByRole('dialog', { name: 'Reading' })
  await refuse(page, `**/api/v1/reading/${item.id}`, 'DELETE')
  await pane.getByRole('button', { name: 'Delete item' }).click()
  await pane.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(said(page)).toBeVisible()
  await expect(pane).toBeVisible()
})

test('an unlink the server refuses says so, and the link stays', async ({ page }) => {
  await registerFreshUser(page)
  const person = await apiPost(page, '/people', { name: 'Ying Chen' })
  const book = await apiPost(page, '/reading', { kind: 'book', title: 'The C book' })
  await apiPost(page, '/links', {
    from: { type: 'person', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  await page.goto(`/people/${person.id}`)
  await refuse(page, '**/api/v1/links?*', 'DELETE')
  await page.getByRole('button', { name: 'Unlink The C book' }).click()
  await expect(said(page)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('The C book')
})

test('a project rename or recolour the server refuses says so', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await page.goto(`/projects/${pid}`)
  await refuse(page, `**/api/v1/projects/${pid}`, 'PATCH')
  await page.getByRole('button', { name: '改版' }).click()
  await page.getByRole('textbox', { name: 'Project name' }).fill('改版二期')
  await page.keyboard.press('Enter')
  await expect(said(page)).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Project colour' }).click()
  await page.getByRole('menuitem', { name: 'Colour 5' }).click()
  await expect(said(page)).toBeVisible()
})

test('a sign-out the server refuses says so', async ({ page }) => {
  await registerFreshUser(page)
  await refuse(page, '**/api/v1/auth/logout', 'POST')
  await logOut(page)
  await expect(said(page)).toBeVisible()
})
