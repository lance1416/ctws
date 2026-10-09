import { expect, test, type Page } from '@playwright/test'
import { backdateProjectActivity, makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * The 今天 workbench: the four panels, the banner, and the grid they sit in.
 *
 * What these guards are for, in order of how easy each would be to fake:
 * - "做到哪儿了 shows the right numbers" is not provable by reading numbers off the screen and
 *   comparing them to numbers the test also computed. It is compared against the SERVER's own
 *   answer, so a panel that quietly counted client-side would have to agree with the query that
 *   produced it, which is the thing being claimed.
 * - "no percentage" cannot be left to the counts test: a bar sitting beside two correct counts
 *   passes any assertion about the counts. It needs its own assertion about what is absent, and
 *   that assertion has to catch a bar drawn as a plain div, not only a <progress>.
 * - "the stagnation line appears only when a project is quiet" needs BOTH halves: a line that is
 *   always rendered passes a test that only looks for it, and a line that is never rendered
 *   passes a test that only looks for its absence.
 * - "it is a panel grid" is only provable geometrically. A class name could say `grid` while the
 *   panels sat in one column, and a single-viewport test cannot tell a grid from a stack.
 */

const HEADERS = { 'x-ctws-client': 'web' }
const WIDE = { width: 1440, height: 1000 }
const PHONE = { width: 375, height: 800 }
const DAY = 86_400_000
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dueAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString()

type Movement = {
  projectId: string
  projectName: string
  doneThisWeek: number
  remaining: number
  lastActivityOn: string | null
  quietDays: number | null
}

const patched = (page: Page) =>
  page.waitForResponse(
    (r) => /\/tasks\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok(),
  )

const movementOf = async (page: Page): Promise<Movement[]> =>
  ((await (await page.request.get('/api/v1/tasks/movement')).json()) as { projects: Movement[] })
    .projects

const panel = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

// --------------------------------------------------------------------- 做到哪儿了: counts, not a ratio

test('做到哪儿了 shows the counts the server reports, for every project that has any', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const ctws = await makeProject(page, '甲线')
  const job = await makeProject(page, '乙线')
  const quiet = await makeProject(page, '丙线')

  // 甲线: two finished today, three left. 乙线: nothing finished, two left.
  for (const t of ['甲一', '甲二']) await makeTask(page, ctws, t, { status: 'done' })
  for (const t of ['甲三', '甲四', '甲五']) await makeTask(page, ctws, t)
  for (const t of ['乙一', '乙二']) await makeTask(page, job, t)
  // 丙线 has nothing at all, so it must not get a line: "0 / 0" is not news.
  expect(quiet).toBeTruthy()

  await page.goto('/tasks/today')
  const where = panel(page, 'Movement')
  await expect(where).toBeVisible()

  // The numbers on screen are the SERVER's, not a second count made here.
  const server = await movementOf(page)
  const withSomething = server.filter((r) => r.doneThisWeek > 0 || r.remaining > 0)
  expect(withSomething.map((r) => r.projectName)).toEqual(['甲线', '乙线'])
  expect(withSomething.map((r) => [r.doneThisWeek, r.remaining])).toEqual([
    [2, 3],
    [0, 2],
  ])

  for (const r of withSomething) {
    const line = where.getByRole('link', { name: new RegExp(`^${r.projectName}`) })
    await expect(line).toHaveCount(1)
    await expect(line).toContainText(`+${r.doneThisWeek} this week`)
    await expect(line).toContainText(`${r.remaining} left`)
  }
  // A project with no work at all gets no line.
  await expect(where.getByText('丙线')).toHaveCount(0)
  // And the number of lines is exactly the number of projects with something to say.
  await expect(where.getByRole('listitem')).toHaveCount(withSomething.length)
})

/**
 * The panel must not draw a percentage or a bar, and this is a separate test on purpose: the
 * counts test above passes unchanged with a bar sitting next to the counts.
 *
 * `manual_progress` is written by nothing in the entire codebase and rollup is M3 work, so a bar
 * here would be drawn against a column that is null for every row in the database -- a number the
 * backend cannot cash. The assertion therefore looks for a bar however it might be built: a
 * <progress>, an ARIA progressbar, a per-cent sign in the text, or any element sized by a
 * percentage width, which is how a hand-rolled bar is made.
 */
test('做到哪儿了 draws no percentage and no progress bar', async ({ page }) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '有进展的')
  await makeTask(page, pid, '做完的一', { status: 'done' })
  await makeTask(page, pid, '做完的二', { status: 'done' })
  await makeTask(page, pid, '没做的')
  // A task carrying an explicit progress value, which is the one input a bar could claim to show.
  await makeTask(page, pid, '写了进度的', { manualProgress: 0.5 })

  await page.goto('/tasks/today')
  const where = panel(page, 'Movement')
  await expect(where.getByText('+2 this week')).toBeVisible()

  await expect(where.getByRole('progressbar')).toHaveCount(0)
  await expect(where.locator('progress, meter')).toHaveCount(0)
  await expect(where).not.toContainText('%')
  await expect(where).not.toContainText('50')
  // A bar built by hand: an element whose width is a fraction of its parent. Nothing inside this
  // panel may be sized that way, so a div-with-a-width bar fails here too.
  const proportional = await where.evaluate(
    (el) =>
      [...el.querySelectorAll<HTMLElement>('*')].filter((n) => {
        const width = n.style.width || getComputedStyle(n).getPropertyValue('--progress')
        return width.includes('%')
      }).length,
  )
  expect(proportional, 'elements sized by a percentage inside 做到哪儿了').toBe(0)
})

// ------------------------------------------------------------------------- the stagnation line

test('the stagnation line names a project only while that project is really quiet', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const live = await makeProject(page, '天天动的')
  const stale = await makeProject(page, '没人管的')
  const finished = await makeProject(page, '已经做完的')

  await makeTask(page, live, '今天刚碰过')
  await makeTask(page, stale, '放了很久')
  const done = await makeTask(page, finished, '早就做完')
  await page.request.patch(`/api/v1/tasks/${done}`, { headers: HEADERS, data: { status: 'done' } })

  // Two projects have been silent for nine days. Only one of them still has work in it.
  backdateProjectActivity(stale, '9 days')
  backdateProjectActivity(finished, '9 days')

  await page.goto('/tasks/today')
  const where = panel(page, 'Movement')
  const server = await movementOf(page)
  const quiet = server.find((r) => r.projectId === stale)!
  expect(quiet.quietDays).toBe(9)

  const line = where.locator('[data-stagnant]')
  await expect(line).toHaveCount(1)
  await expect(line).toHaveAttribute('data-stagnant', stale)
  // The sentence names the project, the day of the last change and how long it has been.
  await expect(line).toContainText('没人管的')
  await expect(line).toContainText('last moved')
  await expect(line).toContainText(String(quiet.quietDays))
  // A project with nothing left to do is not "stagnant", it is finished; it is never named.
  await expect(line).not.toContainText('已经做完的')
  await expect(line).not.toContainText('天天动的')

  // Touch the quiet project: it stops being quiet, and the line goes away entirely because it was
  // the only quiet one. (Without this half, a line that is ALWAYS rendered would pass.)
  await makeTask(page, stale, '又动了一下')
  await page.reload()
  await expect(where.getByText('没人管的')).toBeVisible()
  await expect(where.locator('[data-stagnant]')).toHaveCount(0)
})

test('a workspace where nothing has gone quiet shows no stagnation line at all', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '刚开的')
  await makeTask(page, pid, '刚写的')

  await page.goto('/tasks/today')
  await expect(panel(page, 'Movement').getByText('刚开的')).toBeVisible()
  await expect(page.locator('[data-stagnant]')).toHaveCount(0)
})

// ------------------------------------------------------------------------------ the panel grid

/**
 * The grid, asserted from BOTH ends. One viewport proves nothing about a responsive rule: a page
 * that is always one column passes a 375-only test, and one that is always three columns passes a
 * 1440-only test (and takes the phone's horizontal scrollbar with it).
 */
test('the workbench is a panel grid at 1440 and one column at 375', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '一个名字相当长的项目用来挤宽度')
  // Long, and in progress: this test also asserts zero sideways scroll at 375, and the banner sets
  // its subject at the scale's top step (36/44) -- a short title there fits whatever the banner
  // does with overflow.
  await makeTask(page, pid, '在做的那条，标题长到足以把三十六像素的横幅主语挤出一部手机的宽度去', {
    status: 'in_progress',
  })
  await makeTask(page, pid, '今天的那条', { scheduledOn: ymd(new Date()) })
  await makeTask(page, pid, '一条标题也很长的任务，用来看它会不会把这一行撑出屏幕之外去', {
    dueAt: dueAgo(3),
  })
  const done = await makeTask(page, pid, '今天做完的')
  await page.request.patch(`/api/v1/tasks/${done}`, { headers: HEADERS, data: { status: 'done' } })

  const boxes = async () => {
    const out: Record<string, { x: number; y: number; w: number }> = {}
    for (const name of ['Working on', 'Today', 'Overdue', 'Movement', 'Done today']) {
      const b = (await panel(page, name).boundingBox())!
      expect(b, name).toBeTruthy()
      out[name] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width) }
    }
    return out
  }
  const overflow = () =>
    page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }))

  // --- 1440: two columns of panels, the banner across the top ---
  await page.setViewportSize(WIDE)
  await page.goto('/tasks/today')
  await expect(panel(page, 'Done today')).toBeVisible()
  let b = await boxes()
  // The queue is beside the right-hand panels, not above them.
  expect(b['Today']!.x + b['Today']!.w).toBeLessThanOrEqual(b['Overdue']!.x + 1)
  expect(b['Overdue']!.y).toBeLessThan(b['Today']!.y + b['Today']!.w)
  // The queue really does take two thirds of the grid: it is wider than the right column, and not
  // merely non-zero. (A 1fr/1fr grid would pass a bare "it is to the left of" assertion.)
  expect(b['Today']!.w).toBeGreaterThan(b['Overdue']!.w * 1.6)
  // The three right-hand panels share one column and stack in the designed order.
  expect(b['Movement']!.x).toBe(b['Overdue']!.x)
  expect(b['Done today']!.x).toBe(b['Overdue']!.x)
  expect(b['Overdue']!.y).toBeLessThan(b['Movement']!.y)
  expect(b['Movement']!.y).toBeLessThan(b['Done today']!.y)
  // The banner is the full width of the content area and above everything.
  expect(b['Working on']!.y).toBeLessThan(b['Today']!.y)
  expect(b['Working on']!.w).toBeGreaterThan(b['Today']!.w)
  expect(await overflow()).toEqual({ doc: 0, body: 0 })

  // --- 375: one column, same order, and no sideways scroll ---
  await page.setViewportSize(PHONE)
  await page.goto('/tasks/today')
  await expect(panel(page, 'Done today')).toBeVisible()
  b = await boxes()
  const xs = new Set(Object.values(b).map((v) => v.x))
  expect(xs.size, `panel x values at 375: ${[...xs].join(',')}`).toBe(1)
  const order = Object.entries(b)
    .sort((a, c) => a[1].y - c[1].y)
    .map(([name]) => name)
  expect(order).toEqual(['Working on', 'Today', 'Overdue', 'Movement', 'Done today'])
  expect(await overflow()).toEqual({ doc: 0, body: 0 })
})

// --------------------------------------------------------------------------------- the banner

test('正在做 carries the running task, and says so plainly when nothing is running', async ({
  page,
}) => {
  await registerFreshUser(page)
  await page.setViewportSize(WIDE)
  const pid = await makeProject(page, '工作')
  await makeTask(page, pid, '排到今天的', { scheduledOn: ymd(new Date()) })
  await makeTask(page, pid, '没有日期的')

  await page.goto('/tasks/today')
  const banner = panel(page, 'Working on')
  // Nothing running: the banner is still there, says what would fill it, and holds no row.
  await expect(banner).toBeVisible()
  await expect(banner.getByText('Nothing in progress')).toBeVisible()
  await expect(banner.locator('[data-today-row]')).toHaveCount(0)

  // Start the dateless one from its project row; it is not on 今天 at all until it is running.
  await page.goto(`/projects/${pid}`)
  const started = patched(page)
  await page.getByRole('button', { name: 'Start “没有日期的”' }).click()
  expect((await started).request().postDataJSON()).toEqual({ status: 'in_progress' })

  await page.getByRole('link', { name: 'Today' }).click()
  await expect(banner.getByText('没有日期的')).toBeVisible()
  await expect(banner.locator('[data-today-row]')).toHaveCount(1)
  await expect(banner.getByRole('img', { name: 'In progress' })).toBeVisible()
  await expect(banner.getByText('Nothing in progress')).toHaveCount(0)
  // One task, one panel.
  await expect(page.getByText('没有日期的')).toHaveCount(1)

  // The SERVER decides which panel a task belongs to, and the page does not second-guess it: a
  // task that is started AND planned for today stays in 今天, because that is the segment the
  // server put it in. (A banner filtered on `status === 'in_progress'` would steal it, and would
  // also take an overdue-and-running task out of 逾期.)
  const alsoStarted = patched(page)
  await page.getByRole('button', { name: 'Start “排到今天的”' }).click()
  await alsoStarted
  await expect(panel(page, 'Today').getByText('排到今天的')).toBeVisible()
  await expect(banner.getByText('排到今天的')).toHaveCount(0)

  // The banner's own two controls act on its task, and their visible words are INSIDE their
  // accessible names (WCAG 2.5.3) rather than beside them.
  await expect(banner.getByRole('button', { name: 'Complete “没有日期的”' })).toHaveText('Done')
  const stopped = patched(page)
  await banner.getByRole('button', { name: 'Pause “没有日期的”' }).click()
  expect((await stopped).request().postDataJSON()).toEqual({ status: 'todo' })

  // Back to empty, and the server agrees -- not just the screen.
  await expect(banner.getByText('Nothing in progress')).toBeVisible()
  const tasks = (await (await page.request.get(`/api/v1/tasks?projectId=${pid}`)).json()).tasks as {
    title: string
    status: string
  }[]
  expect(tasks.find((t) => t.title === '没有日期的')!.status).toBe('todo')
})
