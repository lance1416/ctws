import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, WEB } from './helpers'

/**
 * THE READING LIST -- THE SECOND MODULE, through the browser.
 *
 * What is under test here is mostly not the list: it is the SEAM. A second module contributed a
 * rail row, a chord, a search provider, a project block and a capture rule, and the shell was not
 * edited to make room for any of them. The capture rule is the one that could not exist before --
 * with one module there was nothing to route to.
 */

const capture = (page: Page) => page.getByLabel('Capture')
const rowOf = (page: Page, text: string) =>
  page.getByRole('listitem').filter({ hasText: text }).first()

async function captureLine(page: Page, line: string) {
  const posted = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      /\/api\/v1\/(tasks|reading)$/.test(new URL(r.url()).pathname),
  )
  await capture(page).fill(line)
  await capture(page).press('Enter')
  return posted
}

test('a pasted link goes to Reading; a sentence still goes to the inbox', async ({ page }) => {
  // THE WHOLE POINT OF THE SECOND MODULE'S CAPTURE RULE, and the one thing that could not be
  // tested while only one module could take a line.
  await registerFreshUser(page)

  const toReading = await captureLine(page, 'https://linear.invalid/now/redesign')
  expect(new URL(toReading.url()).pathname).toBe('/api/v1/reading')
  await expect(page.getByText('Added to')).toContainText('Reading')

  const toInbox = await captureLine(page, '看看这篇 https://linear.invalid/now/redesign')
  expect(new URL(toInbox.url()).pathname).toBe('/api/v1/tasks')
  await expect(page.getByText('Added to')).toContainText('Inbox')
})

test('an untitled link is listed by host and path', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'link', url: 'https://www.linear.invalid/now/how-we-redesigned-issues' },
  })
  await page.goto('/reading')

  // A pasted link shows its HOST AND PATH -- the host alone ("x.com", "github.com") does not
  // say which tweet or which repo, so a row of it carries no information at all.
  const row = rowOf(page, 'linear.invalid/now/how-we-redesigned-issues')
  await expect(row.getByRole('link')).toHaveText('linear.invalid/now/how-we-redesigned-issues')
  // And the line under it does not repeat what the line above already says.
  await expect(row.getByText('linear.invalid', { exact: true })).toHaveCount(0)
  await expect(row.getByRole('link')).toHaveAttribute(
    'href',
    'https://www.linear.invalid/now/how-we-redesigned-issues',
  )
  // And it opens away from the workspace, so a half-read list is not lost.
  await expect(row.getByRole('link')).toHaveAttribute('target', '_blank')
})

test('a book moves to read → reading → finished, and the finished pile folds away', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '设计心理学', author: 'Don Norman' },
  })
  await page.goto('/reading')

  const section = (name: string) => page.getByRole('region', { name })
  await expect(section('Reading').getByText('设计心理学')).toBeVisible()

  await rowOf(page, '设计心理学').getByRole('button', { name: 'Start reading' }).click()
  await expect(section('Reading now').getByText('设计心理学')).toBeVisible()

  await rowOf(page, '设计心理学').getByRole('button', { name: 'Finished' }).click()
  // Gone from both open sections, and not gone from the app: the count is the way back, which is
  // the rule the task tree already keeps about finished work.
  await expect(section('Reading now')).toHaveCount(0)
  await expect(section('Reading')).toHaveCount(0)
  const toggle = page.getByRole('button', { name: 'Finished 1' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(rowOf(page, '设计心理学')).toBeVisible()
})

test('the rail counts what is waiting, not the size of the pile', async ({ page }) => {
  await registerFreshUser(page)
  const add = (data: Record<string, unknown>) =>
    page.request.post('/api/v1/reading', { headers: WEB, data })
  await add({ kind: 'book', title: '要读的' })
  const done = await (await add({ kind: 'book', title: '读过的' })).json()
  await page.request.patch(`/api/v1/reading/${done.id}`, {
    headers: WEB,
    data: { status: 'done' },
  })

  // The count lives where every kind is listed, in the kind's own words.
  await page.goto('/things')
  await expect(page.locator('[data-kind="Reading"] [data-count]')).toHaveText('1 to read')
})

test('g l goes to Reading, in one keyspace with the task module', async ({ page }) => {
  await registerFreshUser(page)
  // No goto: a fresh navigation leaves focus where the document-level keys do not see it, and
  // this is about the chord, not about where focus lands after a page load.
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await page.keyboard.press('g')
  await page.keyboard.press('l')
  await expect(page).toHaveURL(/\/reading$/)
  await expect(page.getByRole('heading', { name: 'Reading', level: 1 })).toBeVisible()
})

test('search reaches both modules from one box', async ({ page }) => {
  // The shell merges the providers; neither module knows the other is there. The dialog is named
  // “Search” and not “Search tasks” for the same reason.
  await registerFreshUser(page)
  const projects = await (await page.request.get('/api/v1/projects', { headers: WEB })).json()
  const inbox = projects.projects.find((p: { isInbox: boolean }) => p.isInbox)
  await page.request.post('/api/v1/tasks', {
    headers: WEB,
    data: { projectId: inbox.id, title: '配色重做', parentId: null },
  })
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '配色的书' },
  })
  await page.goto('/tasks/today')

  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('配色')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option').filter({ hasText: '配色重做' })).toHaveCount(1)
  await expect(dialog.getByRole('option').filter({ hasText: '配色的书' })).toHaveCount(1)
})

test('a project page carries both modules, each with its own block and numbers', async ({
  page,
}) => {
  await registerFreshUser(page)
  const project = await (
    await page.request.post('/api/v1/projects', { headers: WEB, data: { name: 'CTWS' } })
  ).json()
  await page.request.post('/api/v1/tasks', {
    headers: WEB,
    data: { projectId: project.id, title: '配色重做', parentId: null },
  })
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: {
      kind: 'link',
      url: 'https://example.com/a',
      title: '一篇相关的文章',
      projectId: project.id,
    },
  })
  await page.goto(`/projects/${project.id}`)

  // The task module's block and the reading module's, side by side under one shell project.
  await expect(page.getByText('配色重做')).toBeVisible()
  await expect(page.getByText('一篇相关的文章')).toBeVisible()
  // And the reading module's number is its block's count, beside the tasks.
  await expect(
    page
      .getByRole('region', { name: 'Linked' })
      .getByRole('region', { name: 'Reading' })
      .locator('[data-count]'),
  ).toHaveText('1')
  // The row does NOT repeat the name of the project you are standing in -- the same rule the
  // dependency pane keeps, and the same reason the task tree shows no breadcrumb.
  await expect(page.getByRole('listitem').filter({ hasText: '一篇相关的文章' })).not.toContainText(
    'CTWS',
  )
})

/**
 * 删一条读物在它自己那一层的最底下，和删一个人、一条任务、取消一场会同一个位置。
 *
 * 它以前只有一行加一个 ⋯ 菜单，于是 Rename 和 Delete 都住在菜单里 —— 全 app 唯一一个「在下拉
 * 菜单里改内容」的地方。现在它有自己的一层，菜单只留下「不用打开它就能做的事」。
 */
test('删一条读物在它那一层的最底下，先问一次', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'book', title: '设计心理学', author: 'Don Norman' },
  })
  await page.goto('/reading')
  const deletes: string[] = []
  page.on('request', (r) => r.method() === 'DELETE' && deletes.push(r.url()))

  // 菜单里没有改内容的东西了。
  await rowOf(page, '设计心理学')
    .getByRole('button', { name: /More for/ })
    .click()
  await expect(page.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '设计心理学', exact: true }).click()
  const layer = page.getByRole('dialog', { name: 'Reading' })
  await expect(layer).toBeVisible()
  await expect(page).toHaveURL(new RegExp('/reading/[0-9a-f-]{36}$'))

  const remove = layer.getByRole('button', { name: 'Delete item' })
  // 最后一个东西：Linked 在它上面。
  const [box, linked] = await Promise.all([
    remove.boundingBox(),
    layer.getByText('Linked', { exact: true }).boundingBox(),
  ])
  expect(box!.y).toBeGreaterThan(linked!.y)

  await remove.click()
  const ask = page.getByRole('alertdialog', { name: 'Confirm deleting this item' })
  await expect(ask).toContainText('Delete “设计心理学”?')
  expect(deletes).toHaveLength(0)
  await ask.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('设计心理学')).toHaveCount(0)
  expect(deletes).toHaveLength(1)
})

test('一条读物在它那一层里改，不在下拉菜单里改', async ({ page }) => {
  await registerFreshUser(page)
  await page.request.post('/api/v1/reading', {
    headers: WEB,
    data: { kind: 'link', url: 'https://www.linear.invalid/now/how-we-redesigned-issues' },
  })
  await page.goto('/reading')

  // 标题那一行是去读它的链接（点它会开新标签页），所以这里点的是行上别的地方 —— 打开那一层
  // 是整行的事，这正是两个目标分开的意思。
  await rowOf(page, 'linear.invalid/now/how-we-redesigned-issues')
    .getByText(/^Added/)
    .click()
  const layer = page.getByRole('dialog', { name: 'Reading' })
  await layer.getByRole('button', { name: 'Edit', exact: true }).click()
  await layer.getByLabel('Title').fill('Linear 怎么重做 issue')
  await layer.getByRole('button', { name: 'Save' }).click()

  await expect(layer.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByText('Linear 怎么重做 issue').first()).toBeVisible()
})
