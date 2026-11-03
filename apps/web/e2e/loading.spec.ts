import { expect, test } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * LOADING LOOKS AS LOADED WILL (DES-001 "加载", L-01): what is still being read is neither full
 * nor empty; a region whose layout the data decides waits for all of it and comes in at once,
 * showing one neutral bar if it takes a while; what is under it waits too. Empty blocks take the
 * same columns as full ones.
 */

const blocks = ['Meetings', 'Tasks', 'Recommended reading']

test('a person with nothing linked: the three empty blocks side by side, tops in line', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  const mira = await apiPost<{ id: string }>(page, '/people', { name: 'Mira Chen' })
  await page.goto(`/people/${mira.id}`)
  const tops = []
  for (const name of blocks) {
    const block = page.getByRole('region', { name, exact: true })
    await expect(block).toBeVisible()
    tops.push(Math.round((await block.boundingBox())!.y))
  }
  expect(new Set(tops).size).toBe(1)
})

test('still being read, the blocks are one bar; no count, no timeline, until all are in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  const mira = await apiPost<{ id: string }>(page, '/people', { name: 'Mira Chen' })
  // What is linked comes in slowly: everything that waits on it waits.
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/\/api\/v1\/relations\?/, async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/people/${mira.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Mira Chen' })).toBeVisible()
  const bar = page.locator('main [aria-busy="true"]')
  await expect(bar).toHaveCount(1)
  for (const name of blocks)
    await expect(page.getByRole('region', { name, exact: true })).toHaveCount(0)
  await expect(page.getByText('Timeline', { exact: true })).toHaveCount(0)
  release()
  for (const name of blocks)
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible()
  await expect(bar).toHaveCount(0)
  await expect(page.getByText('Timeline', { exact: true })).toBeVisible()
})

test('Today: while one side block is still read, the side is one bar, no block saying 0', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/\/api\/v1\/communication\?.*view=followups/, async (route) => {
    await held
    await route.continue()
  })
  await page.goto('/today')
  const waiting = page.locator('[data-today-side-waiting]')
  await expect(waiting.locator('[aria-busy="true"]')).toHaveCount(1)
  for (const name of ['Follow up', 'Ready to start', 'Birthdays'])
    await expect(page.getByRole('region', { name, exact: true })).toBeHidden()
  release()
  for (const name of ['Follow up', 'Ready to start', 'Birthdays'])
    await expect(page.getByRole('region', { name, exact: true })).toBeVisible()
  await expect(waiting).toHaveCount(0)
})

test('a meeting whose notes are still read says nothing of them, nor Write, till they are in', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await registerFreshUser(page)
  const made = await apiPost<{ meetingId: string }>(page, '/meetings', {
    title: 'Weekly sync',
    startsLocal: '2026-10-20T14:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
  })
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route(/\/api\/v1\/notes\?.*anchor=meeting/, async (route) => {
    await held
    await route.continue()
  })
  await page.goto(`/meetings/${made.meetingId}?at=2026-10-20T14:00`)
  await expect(page.getByRole('heading', { level: 1, name: 'Weekly sync' })).toBeVisible()
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(1)
  await expect(page.getByText('Nothing written for this one yet.')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Write the notes' })).toBeHidden()
  release()
  await expect(page.getByRole('button', { name: 'Write the notes' })).toBeVisible()
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0)
})
