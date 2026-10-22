import { expect, test, type Page } from '@playwright/test'
import {
  editDetail,
  makeProject,
  makeTask,
  openProject,
  openTree,
  pickOne,
  registerFreshUser,
  serverTasks,
  submitCreate,
  taskPatched,
  WEB,
  navLink,
} from './helpers'
import { dayOffset } from './days'

/**
 * WHAT KEEPS THE APP USABLE AS IT FILLS UP.
 *
 * The tree shows what is left to do and counts the rest; an inbox row says how long it has been
 * sitting there; a refused creation reports itself at the row it failed on; and a save with
 * nothing to save still leaves editing. Each one is about a screen that has been lived in, not
 * a screen with three rows on it.
 */

const row = (page: Page, title: string) =>
  page
    .locator('li[data-depth]')
    .filter({ has: page.getByRole('button', { name: `Task: ${title}`, exact: true }) })

// --------------------------------------------------------------------- the finished pile

test('the tree shows what is left to do, and the count is the way back to the rest', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '写迁移', { status: 'done' })
  await makeTask(page, pid, '补测试', { status: 'cancelled' })
  await makeTask(page, pid, '配色重做')
  await openTree(page, pid)

  await expect(row(page, '配色重做')).toBeVisible()
  await expect(row(page, '写迁移')).toHaveCount(0)
  // Cancelled counts as finished: it is equally not work that is left.
  await expect(row(page, '补测试')).toHaveCount(0)

  const toggle = page.getByRole('button', { name: '2 done' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(row(page, '写迁移')).toBeVisible()
  await expect(row(page, '补测试')).toBeVisible()

  // Remembered per project, so the choice is not re-made on every visit.
  await page.reload()
  await expect(row(page, '写迁移')).toBeVisible()
  await page.getByRole('button', { name: 'Hide done' }).click()
  await expect(row(page, '写迁移')).toHaveCount(0)
})

test('each parent folds its own finished rows, and says how many (FR-054)', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const parent = await makeTask(page, pid, '接入 KaTeX')
  await makeTask(page, pid, '装依赖', { status: 'done' }, parent)
  await makeTask(page, pid, '选版本', { status: 'cancelled' }, parent)
  await makeTask(page, pid, '公式换行', {}, parent)
  await makeTask(page, pid, '另一件', {})
  await openTree(page, pid)

  // Under its parent, after the work still left: one line, at the children's depth.
  await expect(row(page, '公式换行')).toBeVisible()
  await expect(row(page, '装依赖')).toHaveCount(0)
  const fold = page.locator(`[data-done-group]`).getByRole('button', { name: '2 done' })
  await expect(fold).toHaveAttribute('aria-pressed', 'false')
  // Not a row of the list: the list is the tasks.
  await expect(page.locator('[data-task-tree]').getByRole('listitem')).toHaveCount(3)
  // The top level has nothing finished, so it says nothing.
  await expect(page.locator('[data-done-group="top"]')).toHaveCount(0)

  await fold.click()
  await expect(row(page, '装依赖')).toBeVisible()
  await expect(row(page, '选版本')).toBeVisible()
  await expect(row(page, '装依赖')).toHaveAttribute('data-depth', '2')
  // Remembered per project.
  await page.reload()
  await expect(row(page, '装依赖')).toBeVisible()
  await page.getByRole('button', { name: 'Hide done' }).click()
  await expect(row(page, '装依赖')).toHaveCount(0)
})

test('when the last parent’s block and the list end together, its own done comes first', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'Ends')
  for (const t of ['早做完一', '早做完二', '早做完三'])
    await makeTask(page, pid, t, { status: 'done' })
  const last = await makeTask(page, pid, '最后一个父节点')
  await makeTask(page, pid, '还开着', {}, last)
  for (const t of ['子做完一', '子做完二']) await makeTask(page, pid, t, { status: 'done' }, last)
  await openTree(page, pid)

  // BUG-034: the parent's "2 done" closes its block, and only then the project's "3 done".
  await expect(page.locator('[data-done-group]')).toHaveText([/2 done/, /3 done/])
  await expect(page.locator('[data-done-group]').last()).toHaveAttribute('data-done-group', 'top')
})

test('a finished parent with unfinished children is kept, not hidden with them', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const parent = await makeTask(page, pid, '接入 KaTeX', { status: 'done' })
  await makeTask(page, pid, '公式换行', {}, parent)
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

  const patched = () => taskPatched(page)
  const handle = page.getByRole('button', { name: 'Task: 配色重做', exact: true })
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
  await expect(row(page, '配色重做').getByRole('img', { name: 'Backlog' })).toBeVisible()
})

test('a project whose every task is finished reads as cleared, not as empty', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await makeTask(page, pid, '写迁移', { status: 'done' })
  await openTree(page, pid)

  // Telling someone who just cleared their list that they have no tasks YET reads as lost work.
  await expect(page.getByText('This project is clear')).toBeVisible()
  await expect(page.getByText('No tasks in this project yet')).toHaveCount(0)
})

// --------------------------------------------------------------------- how old is this

test('an inbox row says how long it has been sitting there, and only when it must', async ({
  page,
}) => {
  await registerFreshUser(page)
  await submitCreate(page, 'Capture…', '查一下 Cloudflare Tunnel')
  await navLink(page, 'Projects').click()
  await openProject(page, 'Inbox')

  await expect(row(page, '查一下 Cloudflare Tunnel').locator('[data-row-age]')).toHaveText(
    'Captured today',
  )

  // A date is a decision someone made about this task; an age is the absence of one. Once there
  // is a plan the line has something better to say, and the age gets out of its way.
  await row(page, '查一下 Cloudflare Tunnel').click()
  await editDetail(page)
  const saved = taskPatched(page)
  await page.getByLabel('Plan', { exact: true }).fill(new Date().toLocaleDateString('en-CA'))
  await page.getByRole('button', { name: 'Save' }).click()
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

// ------------------------------------------------------- say it where it happened

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
  const box = page.getByRole('textbox', { name: 'New task' })
  await box.fill(tooLong)
  await page.keyboard.press('Enter')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Couldn’t save. What you typed is still here.')
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

// ------------------------------------------------------------ a save that changed nothing

test('saving an untouched task sends nothing and still leaves editing', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Save' }).click()

  // Save on an untouched task means "I am done here": no request, and the pane returns to
  // reading. The press has to DO something visible, or the person cannot tell it worked. Edit
  // coming back is that: while editing it is not there, so its absence proves nothing.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveCount(0)
  expect(writes).toEqual([])
})

// ----------------------------------------------------------------- the shell's own surfaces

test('a code fence is highlighted, and an unlabelled one is left alone', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const id = await makeTask(page, pid, '写 rollup')
  const note = ['```ts', 'const a = 1', '```', '', '```', 'plain output 42', '```'].join('\n')
  await page.request.patch(`/api/v1/tasks/${id}`, { headers: WEB, data: { notes: note } })

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

test('the Projects sidebar makes a project from its head', async ({ page }) => {
  await registerFreshUser(page)
  await navLink(page, 'Projects').click()
  const sidebar = page.getByRole('complementary', { name: 'Projects' })
  await sidebar.getByRole('button', { name: 'New project' }).click()
  const box = sidebar.getByRole('textbox', { name: 'New project' })
  await expect(box).toBeFocused()
  await box.fill('求职')
  await page.keyboard.press('Enter')

  // Straight into it: naming a line of work is the start of putting something in it.
  await expect(page.getByRole('heading', { level: 1, name: '求职' })).toBeVisible()
  await expect(sidebar.getByRole('link', { name: '求职' })).toBeVisible()
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
  // There is no Close BUTTON in the control row: it is a ✕ in the corner, carrying the
  // word as its accessible name for anyone who cannot see it.
  const close = pane.locator('[data-detail-close]')
  await expect(close).toHaveAccessibleName('Close')
  await expect(close).toHaveText('')
  await close.click()
  await expect(pane).toHaveCount(0)

  // And Escape out of editing lands in reading, not out of the pane.
  await row(page, '配色重做').click()
  await editDetail(page)
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(1)
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
})

test('a parent row says how far its leaves are, in its own column (FR-054)', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const live = await makeTask(page, pid, '接入 KaTeX')
  await makeTask(page, pid, '装依赖', { status: 'done' }, live)
  await makeTask(page, pid, '公式换行', { status: 'in_progress' }, live)
  const quiet = await makeTask(page, pid, '写变更日志')
  await makeTask(page, pid, '列个提纲', {}, quiet)

  await openTree(page, pid)
  // Half its leaves done: the bar and the count, and the square where a leaf has its status.
  await expect(row(page, '接入 KaTeX').locator('[data-row-progress]')).toContainText('1/2')
  await expect(row(page, '接入 KaTeX').locator('[data-progress-square]')).toHaveAttribute(
    'data-progress-square',
    '50',
  )
  await expect(row(page, '写变更日志').locator('[data-row-progress]')).toContainText('0/1')
  // Leaves never carry one: their progress is the mark at the head of the row.
  await expect(row(page, '公式换行').locator('[data-row-progress]')).toHaveText('')
})

// ----------------------------------------------------------------- a project can be edited

test('a project can be renamed where it is shown, inbox included', async ({ page }) => {
  await registerFreshUser(page)
  const { projects } = await (await page.request.get('/api/v1/projects')).json()
  const inbox = projects.find((p: { isInbox: boolean }) => p.isInbox)
  await page.goto(`/projects/${inbox.id}`)

  // The inbox was stuck being called "Inbox" in an otherwise Chinese app: the server has taken
  // a rename since M2a and nothing in the interface could send one.
  await page.getByRole('button', { name: 'Inbox' }).click()
  const field = page.getByRole('textbox', { name: 'Project name' })
  await field.fill('Inbox')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
  // And the rail says so too, from the same cache entry.
  await expect(page.locator('nav').getByRole('link', { name: 'Inbox' })).toBeVisible()

  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.find((p: { id: string }) => p.id === inbox.id).name).toBe('Inbox')
})

test('a project colour can be picked from the chip that shows it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await page.goto(`/projects/${pid}`)

  const before = await (await page.request.get('/api/v1/projects')).json()
  const was = before.projects.find((p: { id: string }) => p.id === pid).color

  await page.getByRole('button', { name: 'Project colour' }).click()
  // Waited for, not assumed: reading the server straight after the click is a race the test wins
  // on an idle machine and loses under a full suite run, which is the worst way for it to fail.
  const written = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && r.url().includes(`/projects/${pid}`),
  )
  await page.getByRole('menuitem', { name: 'Pink' }).click()
  await written

  const after = await (await page.request.get('/api/v1/projects')).json()
  expect(after.projects.find((p: { id: string }) => p.id === pid).color).toBe('pink')
  expect(was).not.toBe('pink')
  // The chip is a control, and the project's name is beside it (WCAG 1.4.1).
  await expect(page.getByRole('heading', { level: 1, name: '改版' })).toBeVisible()
})

test('a finished task opens from the Done list, not only restored from it', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const id = await makeTask(page, pid, '写迁移')
  await page.request.patch(`/api/v1/tasks/${id}`, {
    headers: WEB,
    data: { status: 'done', notes: '先问清需求' },
  })

  await page.goto('/review?view=done')
  await page.getByRole('button', { name: '写迁移 改版' }).click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await expect(pane).toBeVisible()
  // Reading it is the point: looking at a finished task does not mean finding it again in its
  // project's tree.
  await expect(pane).toContainText('先问清需求')
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

// ----------------------------------------------------------- doing something to five rows

test('shift-click picks rows, and the bar finishes them in one press', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  for (const t of ['写迁移', '补测试', '接好验证器', '量一遍对比度']) await makeTask(page, pid, t)
  await openTree(page, pid)

  // A plain click still opens the detail, which is the gesture that must not become a mode.
  await row(page, '写迁移').click()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  await page.locator('[data-detail-close]').click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)

  await row(page, '写迁移').click({ modifiers: ['Shift'] })
  await row(page, '补测试').click({ modifiers: ['Shift'] })
  await row(page, '接好验证器').click({ modifiers: ['Shift'] })
  // Shift does not open anything.
  await expect(page.getByRole('dialog', { name: 'Task details' })).toHaveCount(0)
  await expect(page.locator('[data-selection-bar]')).toContainText('3 selected')

  // Shift again takes one back out.
  await row(page, '接好验证器').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-selection-bar]')).toContainText('2 selected')

  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)
  const after = await serverTasks(page, pid)
  const byTitle = Object.fromEntries(
    (after as { title: string; status: string }[]).map((t) => [t.title, t.status]),
  )
  expect(byTitle).toMatchObject({ 写迁移: 'done', 补测试: 'done', 接好验证器: 'todo' })
})

test('the rail count follows tasks finished from the tree', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '今天的三件')
  for (const t of ['一件', '两件', '三件'])
    await makeTask(page, pid, t, { scheduledOn: dayOffset(0) })
  await openTree(page, pid)
  // How many are planned for today, from the server the Today page reads.
  const planned = async () =>
    ((await (await page.request.get('/api/v1/tasks?view=today')).json()) as { tasks?: unknown[] })
      .tasks?.length ?? -1

  for (const t of ['一件', '两件', '三件']) await row(page, t).click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)
  await expect.poll(planned).toBe(0)
})

test('the bar moves the picked rows to another project', async ({ page }) => {
  await registerFreshUser(page)
  const from = await makeProject(page, '改版')
  const to = await makeProject(page, '求职')
  await makeTask(page, from, '改简历')
  await makeTask(page, from, '留在这儿的')
  await openTree(page, from)

  await row(page, '改简历').click({ modifiers: ['Shift'] })
  await pickOne(page, 'Move to project', '求职')

  await expect(row(page, '改简历')).toHaveCount(0)
  const moved = await serverTasks(page, to)
  expect((moved as { title: string; parentId: null }[]).map((t) => t.title)).toEqual(['改简历'])
  // It lands at the destination's root: keeping its old parent would mean moving the parent too.
  expect(moved[0]!.parentId).toBeNull()
})

test('the project title gets the width it needs, not the width it can shrink to', async ({
  page,
}) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/projects/${pid}`)

  // MEASURED, not read. Making the title an editable control collapsed its flex item and the
  // banner truncated the title to a few characters at 1440px -- and every assertion that
  // matched it BY NAME still
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
  await expect(page.locator('[data-selection-bar]')).toContainText('2 selected')

  // One of the two is refused. The other really happens -- that is what makes this about PARTIAL
  // failure rather than about failure.
  await page.route(`**/api/v1/tasks/${b}`, (r) =>
    r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: '{}' }) : r.continue(),
  )
  await page.getByRole('button', { name: 'Mark done' }).click()

  await expect(page.getByRole('alert')).toContainText('(1 left undone)')
  // The one that worked has left the selection; the one that did not is still in it, so pressing
  // again retries precisely that and does not re-do the first.
  await expect(page.locator('[data-selection-bar]')).toContainText('1 selected')
  expect(a).toBeTruthy()
  const server = await serverTasks(page, pid)
  const byTitle = Object.fromEntries(
    (server as { title: string; status: string }[]).map((t) => [t.title, t.status]),
  )
  expect(byTitle).toMatchObject({ 写迁移: 'done', 补测试: 'todo' })

  // And the retry goes through once the refusal stops.
  await page.unroute(`**/api/v1/tasks/${b}`)
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)
})

test('a picked row that leaves the view leaves the selection too', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '改版')
  const parent = await makeTask(page, pid, '大件')
  await makeTask(page, pid, '藏起来的', {}, parent)
  await makeTask(page, pid, '看得见的')
  await openTree(page, pid)

  await row(page, '藏起来的').click({ modifiers: ['Shift'] })
  await row(page, '看得见的').click({ modifiers: ['Shift'] })
  await expect(page.locator('[data-selection-bar]')).toContainText('2 selected')

  // Folded away: what Mark done acts on is what can be seen.
  await page.getByRole('button', { name: 'Collapse' }).click()
  await expect(row(page, '藏起来的')).toHaveCount(0)
  await expect(page.locator('[data-selection-bar]')).toContainText('1 selected')
  await page.getByRole('button', { name: 'Mark done' }).click()
  await expect(page.locator('[data-selection-bar]')).toHaveCount(0)

  const after = await serverTasks(page, pid)
  const byTitle = Object.fromEntries(
    (after as { title: string; status: string }[]).map((t) => [t.title, t.status]),
  )
  expect(byTitle).toMatchObject({ 藏起来的: 'todo', 看得见的: 'done' })
})
