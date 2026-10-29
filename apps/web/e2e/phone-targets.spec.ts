import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { registerFreshUser, sidewaysScroll } from './helpers'
import { PHONE, undersized } from './targets'

/**
 * EVERY TARGET ON A PHONE IS 44 (DES-001): the migration report, which no account the sweep makes
 * has. The pages and layers are swept on the full set of things in phone-targets.pinned.spec.ts.
 */
test.use({ viewport: PHONE, hasTouch: true })

// The report is made once, by the move itself, so a new account has none: this one is the report
// the pre-redesign fixture's move wrote (apps/api/tests/fixtures/pre-redesign.sql), served as is.
test('the migration report on a phone: one column of parts, each row a card, all of it 44 (DES-001, BUG-072)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const report = readFileSync(join(import.meta.dirname, 'migration-report.json'), 'utf8')
  await page.route('**/api/v1/migration', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ contentType: 'application/json', body: report })
      : route.continue(),
  )
  await page.goto('/migration')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your data in the new layout')
  // No sidebar and no tags: the parts one under another, each head with how many (FR-088).
  await expect(page.getByRole('navigation', { name: 'Migration report' })).toBeHidden()
  const parents = page.getByRole('region', { name: 'Parents whose status changed' })
  await expect(parents).toContainText(/\d+ to look at/)
  // A row is a card: its name on a line of its own, read whole, then what it was and is.
  const row = parents.locator('[data-report-item]').first()
  const name = (await row.getByRole('link').first().boundingBox())!
  // What it was, the row's second part, under the name.
  const was = (await row.locator(':scope > *').nth(1).boundingBox())!
  expect(name.width).toBeGreaterThan(40)
  expect(was.y).toBeGreaterThanOrEqual(name.y + name.height - 1)
  expect(await sidewaysScroll(page)).toEqual({ doc: 0, body: 0 })
  // A name is a card: what it was, then its three fields one under another.
  const card = page.locator('[data-report-name]').first()
  const given = (await card.getByRole('textbox', { name: /^Given name/ }).boundingBox())!
  const family = (await card.getByRole('textbox', { name: /^Family name/ }).boundingBox())!
  expect(family.y).toBeGreaterThan(given.y + given.height)
  expect(given.width).toBeGreaterThan(PHONE.width - 100)
  expect(await undersized(page)).toEqual([])
})
