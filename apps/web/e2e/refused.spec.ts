import { expect, test, type Page } from '@playwright/test'
import { makeProject, registerFreshUser } from './helpers'

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
