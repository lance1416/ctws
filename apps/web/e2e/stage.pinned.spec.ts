import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, registerFreshUser, WEB } from './helpers'

/**
 * WHAT COMES NEXT ON A CARD ON THE BOARD BY STAGE (FR-058, artboard 20), on the server pinned at
 * Thursday, October 22, 2026, 00:30 UTC (pinned.ts): the next meeting with the company's people,
 * the day a reply is awaited by, and the column sorted by the nearest of those and the deadline.
 */
test.use({ timezoneId: 'Europe/London' })

const put = async (page: Page, path: string, data: object) => {
  const res = await page.request.put(`/api/v1${path}`, { headers: WEB, data })
  expect(res.ok(), await res.text()).toBe(true)
  return res.json()
}

test('a card names its next meeting and its follow-up, and sorts by the nearest date', async ({
  page,
}) => {
  await registerFreshUser(page)
  const projectId = await makeProject(page, 'Job hunt')
  const { stages } = (await put(page, `/projects/${projectId}/stages`, {
    stages: [{ name: 'Applied' }],
  })) as { stages: { id: string }[] }
  const applied = stages[0]!.id
  // Notion is due next week; Stripe has no deadline but a screen today and a reply due tomorrow.
  await apiPost(page, '/tasks', {
    projectId,
    title: 'Notion',
    stageId: applied,
    dueAt: '2026-10-30T17:00:00Z',
  })
  const stripe = await apiPost(page, '/tasks', { projectId, title: 'Stripe', stageId: applied })
  const company = await apiPost(page, '/organisations', { name: 'Stripe' })
  await apiPost(page, '/relations', {
    from: { type: 'task', id: stripe.id },
    to: { type: 'organisation', id: company.id },
  })
  const mira = await apiPost(page, '/people', { name: 'Mira Chen' })
  await put(page, `/people/${mira.id}/roles`, { roles: [{ organisationId: company.id }] })
  await apiPost(page, '/meetings', {
    title: 'First screen',
    startsLocal: '2026-10-22T14:00',
    timeZone: 'Europe/London',
    durationMinutes: 45,
    attendeeIds: [mira.id],
    // Through a person, only what is filed under this project counts (FR-058).
    projectId,
  })
  await apiPost(page, '/communication', {
    direction: 'sent',
    channel: 'email',
    parties: [{ type: 'person', id: mira.id }],
    subject: 'Availability',
    awaitingReply: true,
    followUpOn: '2026-10-23',
    projectId,
  })

  await page.goto(`/projects/${projectId}?view=board&columns=stage`)
  const cards = page.locator('[data-stage-card]')
  await expect(cards).toHaveCount(2)
  // Today's screen comes before next week's deadline.
  await expect(cards.locator('[data-stage-title]')).toHaveText(['Stripe', 'Notion'])

  const card = cards.first()
  await expect(card.locator('[data-stage-meeting]')).toContainText('First screen')
  await expect(card.locator('[data-stage-meeting]')).toContainText('Thu 14:00')
  await expect(card.locator('[data-stage-follow-up]')).toHaveText('Follow up Tomorrow')
  await expect(card.locator('[data-stage-follow-up]')).toHaveAttribute(
    'title',
    'Awaiting a reply, follow up Oct 23',
  )
  // Notion has neither.
  await expect(cards.nth(1).locator('[data-stage-meeting], [data-stage-follow-up]')).toHaveCount(0)
})
