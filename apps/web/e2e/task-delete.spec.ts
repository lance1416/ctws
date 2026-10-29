import { expect, test, type Page } from '@playwright/test'
import {
  editDetail,
  pressSignOut,
  makeProject,
  makeTask,
  registerFreshUser,
  serverTasks,
  taskPatched,
} from './helpers'

// Deleting a task, and the panel's guard against losing edits on navigation. Every claim about
// what changed is checked against the SERVER (a fresh GET) or a reload, so an implementation that
// only updates the screen cannot pass. (Kept from the Done view's tests when that view went,
// RV-01: none of these were about it.)

const nav = (page: Page) => page.getByRole('navigation', { name: 'Modules' })

// ------------------------------------------------------------------------------ task deletion

/** Opens a row's panel in reading mode, where Delete lives; the unsaved-edit tests press Edit. */
async function openPanel(page: Page, title: string) {
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

test('deleting a parent states how many descendants go, cancel deletes nothing, confirm deletes all', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  const root = await makeTask(page, pid, '大块')
  const kid1 = await makeTask(page, pid, '子一', {}, root)
  await makeTask(page, pid, '子二', {}, root)
  await makeTask(page, pid, '孙一', {}, kid1)
  await makeTask(page, pid, '旁观者')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()

  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  await openPanel(page, '大块')
  // Delete is the edit's last thing (FR-035).
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Delete task' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this task' })
  // Two children and one grandchild: three, not two (direct children only) and not four.
  await expect(ask).toContainText('Delete “大块” and its 3 subtasks. This cannot be undone.')
  expect(deletes).toHaveLength(0) // the first click only asks

  // Cancel: nothing was deleted, on the server or on the screen, and the panel is still there.
  await ask.getByRole('button', { name: 'Cancel' }).click()
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete task' })).toBeFocused()
  expect(deletes).toHaveLength(0)
  expect((await serverTasks(page, pid)).map((t) => t.title).sort()).toEqual(
    ['大块', '子一', '子二', '孙一', '旁观者'].sort(),
  )

  // Escape is also "no", and it cancels the question rather than closing the panel.
  await page.getByRole('button', { name: 'Delete task' }).click()
  await expect(ask).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(ask).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(deletes).toHaveLength(0)
  expect(await serverTasks(page, pid)).toHaveLength(5)

  // Confirm: the whole subtree is gone on the server, the bystander is not.
  await page.getByRole('button', { name: 'Delete task' }).click()
  await ask.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(deletes).toHaveLength(1)
  expect((await serverTasks(page, pid)).map((t) => t.title)).toEqual(['旁观者'])
  await page.reload()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(page.getByRole('main').getByText('旁观者')).toBeVisible()
  await expect(page.getByRole('main').getByText('大块')).toHaveCount(0)
})

test('deleting a leaf does not claim descendants, and works from the Today panel', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '在做的', { status: 'in_progress' })
  await makeTask(page, pid, '另一个', { status: 'in_progress' })
  await page.goto('/today')
  await expect(page.locator('[data-today-row]')).toHaveCount(2)

  await page.locator('[data-today-row]').filter({ hasText: '在做的' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Delete task' }).click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this task' })
  await expect(ask).toContainText('Delete “在做的”. This cannot be undone.')
  await expect(ask).not.toContainText('subtask')
  await ask.getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('在做的')).toHaveCount(0)
  await expect(page.getByText('另一个')).toBeVisible()
  expect((await serverTasks(page, pid)).map((t) => t.title)).toEqual(['另一个'])
  const today = (await (await page.request.get('/api/v1/tasks?view=today')).json()).tasks as {
    title: string
  }[]
  expect(today.map((t) => t.title)).toEqual(['另一个'])
})

// ------------------------------------------------------- the panel and navigation (lost edits)

test('navigating away from a dirty panel asks first; keep editing stays, discard leaves', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto('/projects')
  // Scoped to <main>: the left rail lists every project by name too.
  await page.getByRole('main').getByRole('link', { name: 'P', exact: true }).click()
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')

  await nav(page).getByRole('link', { name: 'Today' }).click()
  // Still here: same page, panel open, the typing intact, and it says why.
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}(\\?|$)`))
  await expect(page.getByRole('dialog')).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('dialog').getByText('You have unsaved changes')).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}(\\?|$)`))
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

  // The browser's back button is a navigation too.
  await page.goBack()
  await expect(page.getByRole('dialog')).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}(\\?|$)`))
  await page.getByRole('button', { name: 'Keep editing' }).click()

  await nav(page).getByRole('link', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page).toHaveURL(/\/review$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await serverTasks(page, pid))[0]!.title).toBe('写方案')
})

test('a clean panel does not stop navigation', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')
  await page.getByLabel('Title').fill('写方案') // back to what it was: not dirty
  await nav(page).getByRole('link', { name: 'Projects' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('Log out with a dirty panel asks first and does not log out until discarded', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')

  const logouts: string[] = []
  page.on('request', (r) => r.url().endsWith('/auth/logout') && logouts.push(r.url()))
  await pressSignOut(page)
  await expect(page.getByRole('dialog')).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')
  await expect(page.getByTestId('current-user')).toBeVisible()
  expect(logouts).toHaveLength(0)
  // Still signed in on the server.
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200)

  await page.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByLabel('Title')).toHaveValue('写方案 v2')

  await pressSignOut(page)
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByLabel('Email')).toBeVisible()
  // The one logout sent is this one: the first press sent none.
  expect(logouts).toHaveLength(1)
  expect((await page.request.get('/api/v1/auth/me')).ok()).toBeFalsy()
})

test('pressing Save and then a nav link at once is not mistaken for losing edits', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写方案')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').first().waitFor()
  await openPanel(page, '写方案')
  await editDetail(page)
  await page.getByLabel('Title').fill('写方案 v2')

  // Hold the save in flight until the link has been followed, so "click Save, then a link" is
  // deterministic rather than a race.
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  await page.route('**/api/v1/tasks/*', async (route) => {
    if (route.request().method() === 'PATCH') await held
    await route.continue()
  })
  await page.getByRole('button', { name: 'Save' }).click()
  await nav(page).getByRole('link', { name: 'Today' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByText('You have unsaved changes')).toHaveCount(0)
  // The save was not lost on the way.
  const saved = taskPatched(page)
  release()
  await saved
  expect((await serverTasks(page, pid))[0]!.title).toBe('写方案 v2')
})

/** Delete is the edit's last thing, under its rule (FR-035, DES-001 section 4); reading has none. */
test('Delete is the last thing in the edit, and not in reading', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeTask(page, pid, '写迁移')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: '写迁移' }).first().click()
  const pane = page.getByRole('dialog')
  await expect(pane).toBeVisible()

  // Reading, there is none.
  const remove = pane.getByRole('button', { name: 'Delete task' })
  await expect(remove).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(remove).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Save' })).toBeVisible()

  // And it is last: no other control below it to hit by accident.
  const [box, notes] = await Promise.all([
    remove.boundingBox(),
    pane.getByText('Notes', { exact: true }).first().boundingBox(),
  ])
  expect(box!.y).toBeGreaterThan(notes!.y)
})
