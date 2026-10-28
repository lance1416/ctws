import { expect, test } from '@playwright/test'
import { makeReading, registerFreshUser } from './helpers'

/**
 * SINCE WHEN (FR-072, FR-073), on the server pinned at Thursday, October 22, 2026, 00:30 UTC
 * (pinned.ts): a book started today says so on its card, and its page has the day it was started.
 */
test.use({ timezoneId: 'Europe/London' })

test('a card says since when it has been read, and its page the day it was started', async ({
  page,
}) => {
  await registerFreshUser(page)
  const id = await makeReading(
    page,
    { kind: 'book', title: 'Thinking in Systems' },
    { status: 'reading' },
  )
  await page.goto('/reading')
  // 00:30 UTC on the 22nd is 01:30 in London: the 22nd on the account's calendar.
  await expect(page.locator(`[data-reading-card="${id}"]`)).toContainText('Since Oct 22')

  await page.locator(`[data-reading-card="${id}"]`).click()
  const about = page.getByRole('complementary', { name: 'Profile' }).getByRole('region', {
    name: 'About',
  })
  await expect(about).toContainText(/Added\s*Oct 22/)
  await expect(about).toContainText(/Started\s*Oct 22/)
})
