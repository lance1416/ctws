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
  // A new name is added to the project's stages first; Save waits for it.
  const added = page.waitForResponse(
    (r) => r.request().method() === 'PUT' && r.url().endsWith('/stages') && r.ok(),
  )
  await box.press('Enter')
  await added
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
  await expect(pane.getByRole('region', { name: 'Timeline' })).toContainText(
    'Stage set to Phone screen',
  )

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

test('a card moved with Alt and an arrow keeps the focus, or its folded stage has it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const [applied, onsite, rejected] = await stagesOf(
    page,
    pid,
    ['Applied', 'Onsite', 'Rejected'],
    ['Rejected'],
  )
  await node(page, pid, 'Stripe', { stageId: applied!.id })
  await openStageBoard(page, pid)

  await card(page, 'Stripe').focus()
  const patched = taskPatched(page)
  await page.keyboard.press('Alt+ArrowRight')
  expect((await patched).request().postDataJSON()).toEqual({ stageId: onsite!.id })
  await expect(column(page, onsite!).locator('[data-stage-title]')).toHaveText(['Stripe'])
  // Still on the card, in its new column: Enter opens it (BUG-044).
  await expect(card(page, 'Stripe')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  await page.keyboard.press('Escape')

  // Into a folded stage, the strip it went into has the focus.
  await card(page, 'Stripe').focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(page.locator(`[data-stage-strip="${rejected!.id}"]`)).toBeFocused()
})

test('Edit stages renames, merges, folds, removes, adds and reorders, as the whole list', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Job hunt')
  const [applied, , onsite, offer, rejected] = await stagesOf(page, pid, [
    'Applied',
    'Phone screen',
    'Onsite',
    'Offer',
    'Rejected',
  ])
  await node(page, pid, 'Spotify', { stageId: applied!.id })
  await node(page, pid, 'Stripe', { stageId: onsite!.id })
  await node(page, pid, 'Monzo', { stageId: onsite!.id })
  await openStageBoard(page, pid)

  await page.getByRole('button', { name: 'Edit stages' }).click()
  const sheet = page.getByRole('dialog', { name: 'Stages in Job hunt' })
  const rows = sheet.locator('[data-stage-row]')
  await expect(rows).toHaveCount(5)
  await expect(rows.first()).toContainText('1 task')

  // A rename reaches every task at the stage; the board's column says it.
  await sheet.getByRole('button', { name: 'Rename Applied' }).click()
  const name = sheet.getByRole('textbox', { name: 'Name of Applied' })
  await name.fill('Applied online')
  await expect(sheet).toContainText('Renames it on 1 task. Enter to keep, Esc to undo.')
  await name.press('Enter')
  await expect(column(page, applied!)).toContainText('Applied online')

  // Esc undoes a rename before it is kept.
  await sheet.getByRole('button', { name: 'Rename Offer' }).click()
  await sheet.getByRole('textbox', { name: 'Name of Offer' }).fill('Offered')
  await sheet.getByRole('textbox', { name: 'Name of Offer' }).press('Escape')
  await expect(sheet.getByRole('button', { name: 'Rename Offer' })).toBeVisible()

  // A name that is there already, in any case, asks; Merge moves its tasks and drops it.
  await sheet.getByRole('button', { name: 'Rename Onsite' }).click()
  await sheet.getByRole('textbox', { name: 'Name of Onsite' }).fill('PHONE SCREEN')
  await sheet.getByRole('textbox', { name: 'Name of Onsite' }).press('Enter')
  const ask = sheet.getByRole('alert')
  await expect(ask).toContainText(
    'Phone screen already exists. Merge them? The 2 tasks at Onsite move to Phone screen.',
  )
  await ask.getByRole('button', { name: 'Merge' }).click()
  await expect(rows).toHaveCount(4)
  await expect(sheet.locator('[data-stage-row]').filter({ hasText: 'Phone screen' })).toContainText(
    '2 tasks',
  )

  // Folded on the board: a strip at the edge.
  await sheet.getByRole('button', { name: 'Fold Rejected on the board' }).click()
  await expect(sheet.getByRole('button', { name: 'Fold Rejected on the board' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator(`[data-stage-strip="${rejected!.id}"]`)).toBeVisible()

  // Unused, it can go; a new one comes in at the end.
  await sheet.locator(`[data-stage-row="${offer!.id}"]`).hover()
  await sheet
    .locator(`[data-stage-row="${offer!.id}"]`)
    .getByRole('button', { name: 'Remove' })
    .click()
  await expect(sheet.locator(`[data-stage-row="${offer!.id}"]`)).toHaveCount(0)
  await sheet.getByRole('button', { name: 'New stage' }).click()
  await sheet.getByRole('textbox', { name: 'New stage' }).fill('Withdrawn')
  await sheet.getByRole('textbox', { name: 'New stage' }).press('Enter')
  await expect(rows.last()).toContainText('Withdrawn')

  // Alt and an arrow moves a stage a place: the board's columns follow.
  await sheet.getByRole('button', { name: 'Move Withdrawn' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(rows.nth(2)).toContainText('Withdrawn')
  await expect(rows.nth(3)).toContainText('Rejected')
})
