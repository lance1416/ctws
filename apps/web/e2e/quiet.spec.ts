import { expect, test, type Page } from '@playwright/test'
import { editDetail, openProject, registerFreshUser, submitCreate } from './helpers'

/**
 * FOUR THINGS THAT MADE THE APP WORSE THE LONGER IT WAS USED (D48, D49, D53, D40).
 *
 * The tree kept every finished task forever, the inbox gave no clue how long anything had been
 * sitting in it, a failed creation reported itself at the top of the page rather than at the row
 * it failed on, and pressing 保存 with nothing changed did nothing at all -- visibly nothing, so
 * the one person who pressed it could not tell whether it had worked.
 */

const HEADERS = { 'x-ctws-client': 'web' }

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  parentId: string | null = null,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const p = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
    expect(p.ok()).toBeTruthy()
  }
  return id
}

/** Waits for the project's task list, so a tree with no visible rows is still "arrived". */
async function openTree(page: Page, projectId: string) {
  const listed = page.waitForResponse((r) => {
    const url = new URL(r.url())
    return (
      r.request().method() === 'GET' &&
      url.pathname === '/api/v1/tasks' &&
      url.searchParams.get('projectId') === projectId
    )
  })
  await page.goto(`/projects/${projectId}`)
  await listed
}

const row = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `任务：${title}`, exact: true }) })

// ------------------------------------------------------------------ D48: the finished pile

test('the tree shows what is left to do, and the count is the way back to the rest', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '写迁移', null, { status: 'done' })
  await makeTask(page, pid, '补测试', null, { status: 'cancelled' })
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)

  await expect(row(page, '配色重做')).toBeVisible()
  await expect(row(page, '写迁移')).toHaveCount(0)
  // Cancelled counts as finished: it is equally not work that is left.
  await expect(row(page, '补测试')).toHaveCount(0)

  const toggle = page.getByRole('button', { name: '已完成 2' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(row(page, '写迁移')).toBeVisible()
  await expect(row(page, '补测试')).toBeVisible()

  // Remembered per project, so the choice is not re-made on every visit.
  await page.reload()
  await expect(row(page, '写迁移')).toBeVisible()
  await page.getByRole('button', { name: '隐藏已完成' }).click()
  await expect(row(page, '写迁移')).toHaveCount(0)
})

test('a finished parent with unfinished children is kept, not hidden with them', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const parent = await makeTask(page, pid, '接入 KaTeX', null, { status: 'done' })
  await makeTask(page, pid, '公式换行', parent)
  await openTree(page, pid)

  // THE TREE'S OLDEST RULE: a list that loses tasks cannot be trusted. Hiding the parent would
  // take the child with it, so the parent stays and only the child is work.
  await expect(row(page, '接入 KaTeX')).toBeVisible()
  await expect(row(page, '公式换行')).toBeVisible()
  // And it is not counted as hidden, because it is not hidden.
  await expect(page.getByRole('button', { name: /已完成/ })).toHaveCount(0)
})

test('a row finished right here stays put, so a mis-press can be undone from it', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)

  const patched = () => page.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok())
  const handle = page.getByRole('button', { name: '任务：配色重做', exact: true })
  await handle.focus()
  // Each press is awaited: `x` computes the NEXT status from the current one, so firing the
  // second before the first has landed would read a stale status and repeat it.
  let done = patched()
  await page.keyboard.press('x')
  await done
  // Deleting the row from under the cursor would take the focus with it and leave the second x
  // -- the undo -- with nothing to land on.
  await expect(row(page, '配色重做')).toBeVisible()
  await expect(handle).toBeFocused()

  done = patched()
  await page.keyboard.press('x')
  await done
  await expect(row(page, '配色重做').getByRole('img', { name: '待整理' })).toBeVisible()
})

test('a project whose every task is finished reads as cleared, not as empty', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '写迁移', null, { status: 'done' })
  await openTree(page, pid)

  // Telling someone who just cleared their list that they have no tasks YET reads as lost work.
  await expect(page.getByText('这个项目清空了')).toBeVisible()
  await expect(page.getByText('这个项目还没有任务')).toHaveCount(0)
})

// ------------------------------------------------------------------ D49: how old is this

test('an inbox row says how long it has been sitting there, and only when it must', async ({
  page,
}) => {
  await registerFreshUser(page)
  await submitCreate(page, '捕获…', '查一下 Cloudflare Tunnel')
  await page.getByRole('link', { name: '项目' }).click()
  await openProject(page, 'Inbox')

  await expect(row(page, '查一下 Cloudflare Tunnel').locator('[data-row-age]')).toHaveText(
    '今天捕获',
  )

  // A date is a decision someone made about this task; an age is the absence of one. Once there
  // is a plan the line has something better to say, and the age gets out of its way.
  await row(page, '查一下 Cloudflare Tunnel').click()
  await editDetail(page)
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.ok() && /\/api\/v1\/tasks\//.test(r.url()),
  )
  await page.getByLabel('排期').fill(new Date().toLocaleDateString('en-CA'))
  await page.getByRole('button', { name: '保存' }).click()
  await saved
  await expect(row(page, '查一下 Cloudflare Tunnel').locator('[data-row-age]')).toHaveCount(0)
})

test('an ordinary project does not date its rows', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)

  // Most rows in an ordinary tree carry no date at all, so an age on each of them would give
  // every single row a second line. Only the inbox grows without anyone deciding anything.
  await expect(row(page, '配色重做').locator('[data-row-age]')).toHaveCount(0)
})

// ------------------------------------------------------------------ D53: say it where it happened

test('a refused creation is reported at the input, which keeps what was typed', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)

  // Over the contract's 500-character ceiling, so the SERVER refuses it -- a real failure path,
  // not a stubbed one.
  const tooLong = '很'.repeat(600)
  const box = page.getByRole('textbox', { name: '新任务' })
  await box.fill(tooLong)
  await page.keyboard.press('Enter')

  const alert = page.getByRole('alert')
  await expect(alert).toHaveText('没能创建，再按一次回车重试。')
  await expect(box).toHaveAttribute('aria-invalid', 'true')
  // The message is wired to the box, so a screen reader meets it as the box's own problem rather
  // than as a loose line somewhere on the page.
  expect(await alert.getAttribute('id')).toBe(await box.getAttribute('aria-describedby'))
  // What was typed is the user's, not the request's.
  await expect(box).toHaveValue(tooLong)

  // A title the server accepts clears it.
  await box.fill('写变更日志')
  await page.keyboard.press('Enter')
  await expect(row(page, '写变更日志')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

// ------------------------------------------------- D40: a save that changed nothing (already right)

test('saving an untouched task sends nothing and still closes the pane', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)

  await row(page, '配色重做').click()
  await editDetail(page)

  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`)
  })
  await page.getByRole('button', { name: '保存' }).click()

  // D40 SAID THIS WAS BROKEN AND IT IS NOT -- measured, by disabling the guard that was about to
  // be added for it and watching this test keep passing. `save`'s own body already skips the
  // request when no field changed, and its success still closes the pane, so 保存 on an untouched
  // task has always meant "I am done here". The entry predates the reading/editing split. What
  // was missing was a test, which is this one; no code changed.
  await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: '标题' })).toHaveCount(0)
  expect(writes).toEqual([])
})

// ------------------------------------------------- the shell, after the 2026-10-08 requests

test('a code fence is highlighted, and an unlabelled one is left alone', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const id = await makeTask(page, pid, '写 rollup')
  const note = ['```ts', 'const a = 1', '```', '', '```', 'plain output 42', '```'].join('\n')
  await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: { notes: note } })

  await openTree(page, pid)
  await row(page, '写 rollup').click()
  const notes = page.locator('[data-detail-notes]')
  // highlight.js ran: the keyword is its own element, wearing this app's token rather than a
  // theme's hex (the colour itself is asserted in the unit tests over styles.css).
  await expect(notes.locator('.hljs-keyword').first()).toHaveText('const')
  // The second fence carries no language, so nothing guessed at it: no spans, just the text.
  const fences = notes.locator('pre code')
  await expect(fences.nth(1)).toHaveText('plain output 42\n')
  await expect(fences.nth(1).locator('span')).toHaveCount(0)
})

test('the project rail makes a project without leaving the page', async ({ page }) => {
  await registerFreshUser(page)
  await page.getByRole('button', { name: '新建项目' }).click()
  const box = page.getByRole('textbox', { name: '新项目' })
  await expect(box).toBeFocused()
  await box.fill('求职')
  await page.keyboard.press('Enter')

  // Straight into it: naming a line of work is the start of putting something in it.
  await expect(page.getByRole('heading', { level: 1, name: '求职' })).toBeVisible()
  await expect(page.locator('nav').getByRole('link', { name: '求职' })).toBeVisible()
})

test('the detail pane closes from the corner, and Escape unwinds one level at a time', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)
  await row(page, '配色重做').click()

  const pane = page.getByRole('dialog')
  await expect(pane).toBeVisible()
  // There is no 关闭 BUTTON in the control row any more: it is a ✕ in the corner, carrying the
  // word as its accessible name for anyone who cannot see it.
  const close = pane.locator('[data-detail-close]')
  await expect(close).toHaveAccessibleName('关闭')
  await expect(close).toHaveText('')
  await close.click()
  await expect(pane).toHaveCount(0)

  // And Escape out of editing lands in reading, not out of the pane.
  await row(page, '配色重做').click()
  await editDetail(page)
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(1)
  await expect(pane.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
})

test('a parent row says how its subtree stands, and a quiet one says nothing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const live = await makeTask(page, pid, '接入 KaTeX')
  const done = await makeTask(page, pid, '装依赖', live, { status: 'done' })
  await makeTask(page, pid, '公式换行', live, { status: 'in_progress' })
  const quiet = await makeTask(page, pid, '写变更日志')
  await makeTask(page, pid, '列个提纲', quiet)
  expect(done).toBeTruthy()

  await openTree(page, pid)
  // §7.3's line, on the parent that has something to report: half its children are done and one
  // of them is running.
  await expect(row(page, '接入 KaTeX').locator('[data-row-rollup]')).toHaveText('50% · 1 进行中')
  // And nothing at all on the parent whose subtree is merely unstarted: a lone 「0%」 would be a
  // second line on half the rows in any tree, saying what the children below already say.
  await expect(row(page, '写变更日志').locator('[data-row-rollup]')).toHaveCount(0)
  // Leaves never carry one: their "progress" is the marker at the head of the row.
  await expect(row(page, '公式换行').locator('[data-row-rollup]')).toHaveCount(0)
})

// ------------------------------------------------------- D54 / D74: a project can be edited

test('a project can be renamed where it is shown, inbox included', async ({ page }) => {
  await registerFreshUser(page)
  const { projects } = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.find((p: { isInbox: boolean }) => p.isInbox)
  await page.goto(`/projects/${inbox.id}`)

  // The inbox was stuck being called "Inbox" in an otherwise Chinese app: the server has taken
  // a rename since M2a and nothing in the interface could send one.
  await page.getByRole('button', { name: 'Inbox' }).click()
  const field = page.getByRole('textbox', { name: '项目名称' })
  await field.fill('收件箱')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: '收件箱' })).toBeVisible()
  // And the rail says so too, from the same cache entry.
  await expect(page.locator('nav').getByRole('link', { name: '收件箱' })).toBeVisible()

  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.find((p: { id: string }) => p.id === inbox.id).name).toBe('收件箱')
})

test('a project colour can be picked from the chip that shows it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await page.goto(`/projects/${pid}`)

  const before = await (await page.request.get('/api/v1/projects')).json()
  const was = before.projects.find((p: { id: string }) => p.id === pid).color

  await page.getByRole('button', { name: '项目颜色' }).click()
  await page.getByRole('menuitem', { name: '颜色 5' }).click()

  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.find((p: { id: string }) => p.id === pid).color).toBe('project-5')
  expect(was).not.toBe('project-5')
  // The chip is a control now, and it still carries the project's name beside it (WCAG 1.4.1).
  await expect(page.getByRole('heading', { level: 1, name: '改版' })).toBeVisible()
})

test('a finished task opens from the 已完成 list, where it could only be restored (D58)', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const id = await makeTask(page, pid, '写迁移')
  await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: HEADERS,
    data: { status: 'done', notes: '先问清需求' },
  })

  await page.goto('/tasks/completed')
  await page.getByRole('button', { name: '写迁移 改版' }).click()
  const pane = page.getByRole('dialog', { name: '任务详情' })
  await expect(pane).toBeVisible()
  // Reading it is the point: until now the only thing this list could do to a task was restore
  // it, so looking at one meant finding it again in its project's tree.
  await expect(pane).toContainText('先问清需求')
  await expect(pane.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
})

// ------------------------------------------------------------ D61: doing something to five rows

test('shift-click picks rows, and the bar finishes them in one press', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  for (const t of ['写迁移', '补测试', '接好验证器', '量一遍对比度']) await makeTask(page, pid, t)
  await openTree(page, pid)

  // A plain click still opens the detail, which is the gesture that must not become a mode.
  await row(page, '写迁移').click()
  await expect(page.getByRole('dialog', { name: '任务详情' })).toBeVisible()
  await page.locator('[data-detail-close]').click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)

  await row(page, '写迁移').click({ modifiers: ['Shift'] })
  await row(page, '补测试').click({ modifiers: ['Shift'] })
  await row(page, '接好验证器').click({ modifiers: ['Shift'] })
  // Shift does not open anything.
  await expect(page.getByRole('dialog', { name: '任务详情' })).toHaveCount(0)
  await expect(page.locator('[data-selection-bar]')).toContainText('已选 3')

  // Shift again takes one back out.
  await row(page, '接好验证器').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-selection-bar]')).toContainText('已选 2')

  await page.getByRole('button', { name: '标记完成' }).click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)
  const after = await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()
  const byTitle = Object.fromEntries(
    (after.tasks as { title: string; status: string }[]).map((t) => [t.title, t.status]),
  )
  expect(byTitle).toMatchObject({ 写迁移: 'done', 补测试: 'done', 接好验证器: 'todo' })
})

test('the bar moves the picked rows to another project', async ({ page }) => {
  await registerFreshUser(page)
  const from = await makeProject(page, '改版')
  const to = await makeProject(page, '求职')
  await makeTask(page, from, '改简历')
  await makeTask(page, from, '留在这儿的')
  await openTree(page, from)

  await row(page, '改简历').click({ modifiers: ['Shift'] })
  await page.getByLabel('移到项目').selectOption({ label: '求职' })

  await expect(row(page, '改简历')).toHaveCount(0)
  const moved = await (await page.request.get(`/api/v1/tasks?projectId=${to}`)).json()
  expect((moved.tasks as { title: string; parentId: null }[]).map((t) => t.title)).toEqual([
    '改简历',
  ])
  // It lands at the destination's root: keeping its old parent would mean moving the parent too.
  expect(moved.tasks[0].parentId).toBeNull()
})

test('the project title gets the width it needs, not the width it can shrink to', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/projects/${pid}`)

  // MEASURED, not read. Making the title an editable control collapsed its flex item and the
  // banner rendered 「改...」 at 1440px -- and every assertion that matched it BY NAME still
  // passed, because truncation is CSS and the accessible name is whole.
  const heading = page.getByRole('heading', { level: 1, name: '改版' })
  const cut = await heading.evaluate((el) => {
    const inner = el.querySelector('button') ?? el
    return inner.scrollWidth > inner.clientWidth + 1
  })
  expect(cut, 'the project name is truncated at desk width').toBe(false)
})

test('a half-failed bulk action leaves exactly what still needs doing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const a = await makeTask(page, pid, '写迁移')
  const b = await makeTask(page, pid, '补测试')
  await openTree(page, pid)

  await row(page, '写迁移').click({ modifiers: ['Shift'] })
  await row(page, '补测试').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-selection-bar]')).toContainText('已选 2')

  // One of the two is refused. The other really happens -- that is what makes this about PARTIAL
  // failure rather than about failure.
  await page.route(`**/api/v1/tasks/${b}`, (r) =>
    r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
  )
  await page.getByRole('button', { name: '标记完成' }).click()

  await expect(page.getByRole('alert')).toContainText('还剩 1 条没做')
  // The one that worked has left the selection; the one that did not is still in it, so pressing
  // again retries precisely that and does not re-do the first.
  await expect(page.locator('[data-selection-bar]')).toContainText('已选 1')
  expect(a).toBeTruthy()
  const server = await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()
  const byTitle = Object.fromEntries(
    (server.tasks as { title: string; status: string }[]).map((t) => [t.title, t.status]),
  )
  expect(byTitle).toMatchObject({ 写迁移: 'done', 补测试: 'todo' })

  // And the retry goes through once the refusal stops.
  await page.unroute(`**/api/v1/tasks/${b}`)
  await page.getByRole('button', { name: '标记完成' }).click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)
})
