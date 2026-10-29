import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * WAITING FOR A REPLY (FR-048, FR-071, FR-079), on the server pinned at Thursday, October 22,
 * 2026, 00:30 UTC (pinned.ts): every day below comes from that instant.
 */
test.use({ timezoneId: 'Europe/London' })

const send = (page: Page, data: object) =>
  apiPost(page, '/communication', { direction: 'sent', channel: 'email', ...data })

test('a sent one waits five days by default, and the follow-up day says how near it is', async ({
  page,
}) => {
  await registerFreshUser(page)
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  await page.goto(`/people/${priya.id as string}`)
  await page.getByRole('heading', { level: 1, name: 'Priya Nair' }).waitFor()
  await page.keyboard.press('n')
  await page.keyboard.press('x')
  const form = page.getByRole('dialog', { name: 'Log a message' })
  await expect(form.getByRole('button', { name: 'Remove Priya Nair' })).toBeVisible()
  await form.getByRole('textbox', { name: 'Subject' }).fill('Onsite dates')
  await form.getByRole('switch', { name: /Waiting for a reply/ }).check()
  // Five days on from Thursday the 22nd (FR-048).
  await expect(form.getByRole('textbox', { name: 'Follow up on' })).toHaveValue(/Oct 27/)
  await form.getByRole('button', { name: /^Log message/ }).click()
  await expect(form).toHaveCount(0)

  await page.goto('/communication')
  const row = page.locator('[data-awaiting]').filter({ hasText: 'Onsite dates' })
  await expect(row).toContainText('Priya Nair')
  await expect(row).toContainText('0 days')
  await expect(row).toContainText('Tue, Oct 27')
  await expect(
    page.getByRole('navigation', { name: 'Communication' }).getByRole('region', {
      name: 'Awaiting reply',
    }),
  ).toContainText('Follow up Oct 27')
})

test('on its day it is on Today; Follow up Mon moves it, and the reply closes it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  const who = [{ type: 'person', id: priya.id }]
  await send(page, {
    parties: who,
    subject: 'Onsite dates',
    occurredAt: '2026-10-16T09:00:00.000Z',
    awaitingReply: true,
    followUpOn: '2026-10-21',
  })
  await send(page, {
    parties: who,
    subject: 'Referral form',
    occurredAt: '2026-10-17T09:00:00.000Z',
    awaitingReply: true,
    followUpOn: '2026-10-22',
  })
  await send(page, {
    parties: who,
    subject: 'Not yet',
    occurredAt: '2026-10-20T09:00:00.000Z',
    awaitingReply: true,
    followUpOn: '2026-10-26',
  })
  await page.goto('/today')
  const block = page.getByRole('region', { name: 'Follow up', exact: true })
  const onsite = block.locator('[data-follow-up]').filter({ hasText: 'Onsite dates' })
  await expect(onsite).toContainText('Sent Oct 16')
  await expect(onsite).toContainText('Due yesterday')
  await expect(
    block.locator('[data-follow-up]').filter({ hasText: 'Referral form' }),
  ).toContainText('Due today')
  await expect(block).not.toContainText('Not yet')

  // Monday the 26th: off Today until then.
  await onsite.getByRole('button', { name: 'Follow up on Onsite dates Monday' }).click()
  await expect(onsite).toHaveCount(0)

  // The reply closes it (FR-048).
  const referral = block.locator('[data-follow-up]').filter({ hasText: 'Referral form' })
  await referral.getByRole('button', { name: 'Log the reply to Referral form' }).click()
  const reply = page.getByRole('dialog', { name: 'Log the reply' })
  await expect(reply.getByRole('textbox', { name: 'Subject' })).toHaveValue('Re: Referral form')
  await reply.getByRole('textbox', { name: 'What was said' }).fill('Sent it over.')
  await reply.getByRole('button', { name: /^Log message/ }).click()
  await expect(reply).toHaveCount(0)
  await expect(block).toContainText('Nothing to chase today')

  await page.goto('/communication')
  await expect(page.locator('[data-awaiting]').filter({ hasText: 'Referral form' })).toHaveCount(0)
  await expect(page.locator('[data-awaiting]').filter({ hasText: 'Onsite dates' })).toContainText(
    'Mon, Oct 26',
  )
})

test('a project lists who is waiting for a reply in it (FR-055)', async ({ page }) => {
  await registerFreshUser(page)
  const priya = await apiPost(page, '/people', { givenName: 'Priya', familyName: 'Nair' })
  const jobs = await apiPost(page, '/projects', { name: 'Job hunt' })
  await send(page, {
    parties: [{ type: 'person', id: priya.id }],
    subject: 'Onsite dates',
    occurredAt: '2026-10-16T09:00:00.000Z',
    awaitingReply: true,
    followUpOn: '2026-10-21',
    projectId: jobs.id,
  })
  await send(page, {
    parties: [{ type: 'person', id: priya.id }],
    subject: 'Elsewhere',
    occurredAt: '2026-10-16T09:00:00.000Z',
    awaitingReply: true,
    followUpOn: '2026-10-21',
  })
  await page.goto(`/projects/${jobs.id as string}`)
  // Awaiting reply, one line a message: its day, who (an avatar), what, and when to chase it; a
  // day gone by is a nudge, said as one (artboard 8, U-12).
  const block = page.getByRole('region', { name: 'Awaiting reply' })
  await expect(block).toContainText('Onsite dates')
  await expect(block).toContainText('PN')
  await expect(block).toContainText('Yesterday')
  await expect(block).not.toContainText('Elsewhere')
})

test('each organisation in touch is one row, with what is next', async ({ page }) => {
  await registerFreshUser(page)
  const morrow = await apiPost(page, '/organisations', { name: 'Morrow Legal' })
  const clifford = await apiPost(page, '/organisations', { name: 'Clifford Rowe LLP' })
  for (let i = 0; i < 3; i++)
    await send(page, {
      parties: [{ type: 'organisation', id: morrow.id }],
      subject: `Enquiry ${i}`,
      occurredAt: `2026-10-1${i}T09:00:00.000Z`,
    })
  await apiPost(page, '/communication', {
    direction: 'received',
    channel: 'email',
    parties: [{ type: 'organisation', id: clifford.id }],
    subject: 'Not taking new clients',
    occurredAt: '2026-10-13T09:00:00.000Z',
  })
  await page.goto('/communication')
  const table = page.getByRole('region', { name: 'Organisations in touch' })
  const row = table.locator('[data-in-touch]').filter({ hasText: 'Morrow Legal' })
  // However many times, one row (FR-071); twelve days since the first unanswered one.
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Enquiry 2')
  await expect(row).toContainText('No reply, 12 days')
  await expect(
    table.locator('[data-in-touch]').filter({ hasText: 'Clifford Rowe LLP' }),
  ).toContainText('Nothing')
})
