import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, registerFreshUser, stageSince, taskPatched, WEB } from './helpers'

/**
 * STAGES (FR-040) AND THE BOARD BY STAGE (FR-058, artboard 20): a node's stage set in the
 * inspector, the project's stages offered again, and a column per stage of the nodes at it.
 */

type Stage = { id: string; name: string }

/** The project's stages, in order; the folded ones say so. */
async function stagesOf(page: Page, projectId: string, names: string[], folded: string[] = []) {
  const res = await page.request.put(`/api/v1/projects/${projectId}/stages`, {
    headers: WEB,
    data: { stages: names.map((name) => ({ name, collapsed: folded.includes(name) })) },
  })
  expect(res.ok(), await res.text()).toBe(true)
  return ((await res.json()) as { stages: Stage[] }).stages
}
const node = (
  page: Page,
  projectId: string,
  title: string,
  extra: { parentId?: string; stageId?: string; status?: string } = {},
) => apiPost(page, '/tasks', { projectId, title, parentId: null, ...extra })

const column = (page: Page, stage: Stage) => page.locator(`[data-stage-column="${stage.id}"]`)
const card = (page: Page, title: string) =>
  page
    .locator('[data-stage-card]')
    .filter({ has: page.locator('[data-stage-title]').getByText(title, { exact: true }) })

async function openStageBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}?view=board`)
  await page.getByRole('tab', { name: 'Stage' }).click()
  await expect(page).toHaveURL(/columns=stage/)
}

test('a stage is set in the inspector, offered again, and logged', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  await node(page, pid, 'Stripe')
  await node(page, pid, 'Monzo')
  await page.goto(`/projects/${pid}`)

  await page.getByRole('listitem').filter({ hasText: 'Stripe' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  const box = pane.getByRole('combobox', { name: 'Stage' })
  await box.fill('Phone screen')
  await box.press('Enter')
  const patched = taskPatched(page)
  await pane.getByRole('button', { name: 'Save' }).click()
  const body = (await patched).request().postDataJSON() as { stageId: string }
  expect(body.stageId).toMatch(/^[0-9a-f-]{36}$/)

  // Read: a row of its own, the stage's label; in the tree, beside the name.
  await expect(pane.locator('[data-stage-label]')).toHaveText(/Phone screen/)
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Stripe' }).locator('[data-stage-label]'),
  ).toHaveText(/Phone screen/)
  // And logged on its timeline (FR-040).
  await expect(pane.getByRole('region', { name: 'Timeline' })).toContainText('Stage Phone screen')

  // Offered again, for another company, whatever case it is typed in.
  await page.getByRole('listitem').filter({ hasText: 'Monzo' }).first().click()
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(pane.locator('datalist option[value="Phone screen"]')).toHaveCount(1)
  await pane.getByRole('combobox', { name: 'Stage' }).fill('phone SCREEN')
  await pane.getByRole('combobox', { name: 'Stage' }).press('Enter')
  await expect(pane.getByRole('combobox', { name: 'Stage' })).toHaveValue('Phone screen')
})

test('the board by stage: a column a stage, the folded ones a strip, the deep ones with their path', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const [applied, , onsite, offer, rejected] = await stagesOf(
    page,
    pid,
    ['Applied', 'Phone screen', 'Onsite', 'Offer', 'Rejected'],
    ['Rejected'],
  )
  const gitlab = await node(page, pid, 'GitLab', { stageId: applied!.id })
  await node(page, pid, 'Spotify', { stageId: applied!.id })
  const amazon = await node(page, pid, 'Amazon')
  const sde = await node(page, pid, 'SDE II, AWS Payments', {
    parentId: amazon.id,
    stageId: onsite!.id,
  })
  await node(page, pid, 'Prepare the system design round', { parentId: sde.id })
  await node(page, pid, 'Datadog', { stageId: rejected!.id, status: 'cancelled' })
  // Three weeks at Applied, from a day long gone: past the two weeks that call for a chase.
  stageSince(gitlab.id, '2019-03-14T12:00:00Z')
  await openStageBoard(page, pid)

  // The project's stages in its order, the folded one a strip at the edge.
  await expect(page.locator('[data-stage-column]')).toHaveCount(4)
  await expect(page.locator(`[data-stage-strip="${rejected!.id}"]`)).toHaveAccessibleName(
    'Rejected, 1',
  )
  // The longest waiting first; a while at the stage is amber.
  await expect(column(page, applied!).locator('[data-stage-title]')).toHaveText([
    'GitLab',
    'Spotify',
  ])
  await expect(card(page, 'GitLab').locator('[data-stage-days]')).toHaveAttribute(
    'data-stage-days',
    'stale',
  )
  // A node below the top: its path above it, and the next thing to do under it.
  await expect(card(page, 'SDE II, AWS Payments').locator('[data-stage-path]')).toHaveText('Amazon')
  await expect(card(page, 'SDE II, AWS Payments').locator('[data-stage-next]')).toContainText(
    'Prepare the system design round',
  )
  // An empty stage is a narrow column with its head.
  await expect(column(page, offer!).locator('[data-stage-card]')).toHaveCount(0)

  // The choice is in the address.
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Stage' })).toHaveAttribute('aria-selected', 'true')
})

test('a column’s + makes a node at its stage, at the top of the project, to do', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const [applied] = await stagesOf(page, pid, ['Applied', 'Onsite'])
  await node(page, pid, 'Spotify', { stageId: applied!.id })
  await openStageBoard(page, pid)

  await column(page, applied!).getByRole('button', { name: 'New in Applied' }).click()
  const box = column(page, applied!).getByRole('textbox', { name: 'New in Applied' })
  await box.fill('Figma')
  await box.press('Enter')
  await expect(card(page, 'Figma')).toBeVisible()
  const listed = await page.request.get(`/api/v1/tasks?projectId=${pid}`)
  const figma = ((await listed.json()) as { tasks: Record<string, unknown>[] }).tasks.find(
    (t) => t.title === 'Figma',
  )!
  expect([figma.parentId, figma.stageId, figma.status]).toEqual([null, applied!.id, 'todo'])
})

test('a card dragged to another stage takes it, and keeps its status', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const [applied, onsite] = await stagesOf(page, pid, ['Applied', 'Onsite'])
  await node(page, pid, 'Stripe', { stageId: applied!.id, status: 'in_progress' })
  await openStageBoard(page, pid)

  const patched = taskPatched(page)
  await card(page, 'Stripe').hover()
  await page.mouse.down()
  const target = (await column(page, onsite!).boundingBox())!
  await page.mouse.move(target.x + target.width / 2, target.y + 60, { steps: 8 })
  await page.mouse.move(target.x + target.width / 2, target.y + 70, { steps: 4 })
  await page.mouse.up()
  expect((await patched).request().postDataJSON()).toEqual({ stageId: onsite!.id })
  await expect(column(page, onsite!).locator('[data-stage-title]')).toHaveText(['Stripe'])
  const listed = await page.request.get(`/api/v1/tasks?projectId=${pid}`)
  const stripe = ((await listed.json()) as { tasks: Record<string, unknown>[] }).tasks[0]!
  expect(stripe.status).toBe('in_progress')
})
