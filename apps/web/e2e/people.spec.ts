import { expect, test, type Page } from '@playwright/test'
import { holdFirstRead, makeProject, pickOne, registerFreshUser, WEB } from './helpers'

/**
 * PEOPLE -- THE THIRD MODULE.
 *
 * Two things are under test. The vCard claim: a person has SEVERAL ways to be reached, and they
 * are links rather than text to copy. And the seam claim: a third module registered without the
 * contract changing at all.
 */

const row = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name }).first()

/** The row's body: one link, to the person's own address. */
const personLink = (page: Page, name: string) =>
  page.locator('[data-person-row]').filter({ hasText: name }).getByRole('link')

/** The month names the app prints, so a spec can build the string the page will show. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function add(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/v1/people', { headers: WEB, data })
  // Asserted, because a payload the contract refused used to leave the test looking at an empty
  // list and blaming the page.
  expect(res.status(), await res.text()).toBe(201)
  return res
}

test('a person keeps several addresses, and each one is a link', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await add(page, {
    name: '陈颖',
    org: 'Acme 招聘',
    channels: [
      { kind: 'email', value: 'ying@acme.test', label: '工作' },
      { kind: 'phone', value: '+86 138 0000 0000' },
      { kind: 'url', value: 'github.com/ying' },
    ],
  })
  const id = ((await made.json()) as { id: string }).id
  await page.goto(`/people/${id}`)

  // In the person's sheet: the list row says who they are, and the sheet how to reach them.
  const person = page.getByRole('dialog', { name: 'People' })
  await expect(person.getByRole('link', { name: 'ying@acme.test' })).toHaveAttribute(
    'href',
    'mailto:ying@acme.test',
  )
  // The spacing a person writes a number with is not what a dialler takes.
  await expect(person.getByRole('link', { name: '+86 138 0000 0000' })).toHaveAttribute(
    'href',
    'tel:+8613800000000',
  )
  // A bare host would otherwise link inside the app and go nowhere.
  await expect(person.getByRole('link', { name: 'github.com/ying' })).toHaveAttribute(
    'href',
    'https://github.com/ying',
  )
  await expect(person).toContainText('工作')
})

/**
 * Made while the list's first read is still out: the person opens as themselves. The refetch after
 * the write used to be handed that read -- which left before the write -- so the new person's own
 * sheet said they were "not here any more".
 */
test('a person made while the list is still loading opens as themselves', async ({ page }) => {
  await registerFreshUser(page, '/')
  const release = await holdFirstRead(page, '**/api/v1/people')
  await page.goto('/people')
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/people$/.test(r.url()),
  )
  await page.getByLabel('Add a name').fill('李雷')
  await page.getByLabel('Add a name').press('Enter')
  await made
  release()
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('李雷')
  await expect(page.getByText('This person is not here any more.')).toHaveCount(0)
})

test('a person is made by typing a name, and finished in the pane', async ({ page }) => {
  // One line into a box, like every other thing this app makes. The form that used to stand
  // between a name and a person is gone.
  await registerFreshUser(page, '/people')
  await page.getByLabel('Add a name').fill('李雷')
  await page.getByLabel('Add a name').press('Enter')

  // The pane opens on them: a name alone is never all you know about somebody, and this is the
  // moment you have the rest of it to hand.
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane).toContainText('李雷')

  // 一个显眼的入口，不是十个隐形的：读的时候这一层里只有 Edit 可以按。
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()
  await pane.getByRole('textbox', { name: 'Item 1' }).fill('lilei@acme.test')
  await pane.getByRole('button', { name: 'Save' }).click()

  await expect(pane).toContainText('lilei@acme.test')
  // 存完回到阅读态：刚写下的东西就在眼前，而不是停在一张表上。
  await expect(pane.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('a person can be on several lines of work at once', async ({ page }) => {
  await registerFreshUser(page, '/')
  const hunt = await makeProject(page, '找工作')
  const ctws = await makeProject(page, 'CTWS')
  await add(page, { name: '陈颖' })
  await page.goto('/people')

  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  // 连着挑两个，中间不等：一次保存写回去的是两个，不是最后那一个。
  for (const name of ['找工作', 'CTWS']) {
    await pane.getByRole('button', { name: 'Add Projects' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane).toContainText('找工作')
  await expect(pane).toContainText('CTWS')

  // On BOTH lines, and found from either -- under Linked now, which is where every kind of
  // edge is drawn since the per-module blocks went.
  for (const pid of [hunt, ctws]) {
    await page.goto(`/projects/${pid}`)
    await expect(
      page.getByRole('region', { name: 'Linked' }).getByRole('region', { name: 'People' }),
    ).toContainText('陈颖')
  }
})

test('a line of work is taken off without touching the others', async ({ page }) => {
  await registerFreshUser(page, '/')
  const hunt = await makeProject(page, '找工作')
  const ctws = await makeProject(page, 'CTWS')
  await add(page, { name: '陈颖', projectIds: [hunt, ctws] })
  await page.goto('/people')

  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Remove Projects “找工作”' }).click()
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane).not.toContainText('找工作')
  await expect(pane).toContainText('CTWS')

  await page.goto(`/projects/${hunt}`)
  await expect(page.getByRole('region', { name: 'Linked' })).not.toContainText('陈颖')
})

test('an address removed in the pane is really gone', async ({ page }) => {
  // The failure mode of a replace-the-set write is an orphan nobody can delete.
  await registerFreshUser(page, '/people')
  await add(page, {
    name: '韩梅梅',
    channels: [
      { kind: 'email', value: 'old@acme.test' },
      { kind: 'email', value: 'keep@acme.test' },
    ],
  })
  await page.reload()

  await personLink(page, '韩梅梅').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Remove item 1' }).click()
  await pane.getByRole('button', { name: 'Save' }).click()

  await expect(pane).toContainText('keep@acme.test')
  await expect(pane).not.toContainText('old@acme.test')
})

// ------------------------------------------------------------------ the row: margin, thread, body

/**
 * A PERSON'S ROW IS THE APP'S ROW: the margin says when (their next birthday, with a cake), the
 * thread is their first line of work, and the body says who -- an initial, the name, what they do
 * and where, and the city at the far end. The same margin and thread x as the page's heading, which
 * is what makes it one page and not a list dropped under a title.
 */
test('a person row hangs on the margin: next birthday, first project, then who they are', async ({
  page,
}) => {
  await registerFreshUser(page, '/')
  await page.setViewportSize({ width: 1440, height: 900 })
  const hunt = await makeProject(page, '找工作')
  const made = await add(page, {
    name: '陈颖',
    title: 'Engineering manager',
    org: 'Acme',
    city: 'Toronto',
    projectIds: [hunt],
    birthday: { calendar: 'solar', month: 3, day: 9 },
  })
  const ying = (await made.json()) as {
    id: string
    projects: { id: string }[]
    birthday: { next: { day: string } }
  }
  await add(page, { name: 'Lena Fischer', circle: 'friend' })
  await page.goto('/people')

  const yRow = page.locator(`[data-person-row="${ying.id}"]`)
  // The margin: the SERVER's next birthday, month and day, beside the cake.
  const [, m, d] = ying.birthday.next.day.split('-').map(Number)
  await expect(yRow.locator('[data-birthday-lead] time')).toHaveText(`${MONTHS[m! - 1]} ${d}`)
  await expect(yRow.locator('[data-birthday-lead] [data-cake]')).toHaveCount(1)
  // The thread: their first line of work's.
  await expect(yRow.locator('[data-project-rail]')).toHaveAttribute(
    'data-project-rail',
    ying.projects[0]!.id,
  )
  // The body: one link to them, the initial, the name, what they do, and the city.
  const body = yRow.getByRole('link')
  await expect(body).toHaveAttribute('href', `/people/${ying.id}`)
  await expect(body.locator('[data-person-initial]')).toHaveText('陈')
  await expect(body.locator('[data-person-name]')).toHaveText('陈颖')
  // ...and the line of work the thread's colour stands for, by name: a colour is never alone.
  await expect(body.locator('[data-person-meta]')).toHaveText('Engineering manager, Acme · 找工作')
  const end = (await body.boundingBox())!
  const city = (await body.getByText('Toronto').boundingBox())!
  expect(end.x + end.width - (city.x + city.width), 'the city is at the far end').toBeLessThan(12)

  // Nothing to say is said with nothing: no birthday, no project, no job -- their circle instead.
  const lRow = page.locator('[data-person-row]').filter({ hasText: 'Lena Fischer' })
  await expect(lRow.locator('[data-birthday-lead] time')).toHaveCount(0)
  await expect(lRow.locator('[data-project-rail]')).toHaveCount(0)
  await expect(lRow.locator('[data-person-meta]')).toHaveText('Friend')

  // ONE x for the threads, and the page's heading hangs there too.
  const threads = await page
    .locator('[data-person-row] [data-thread]')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().x)))
  expect(threads).toHaveLength(2)
  expect(new Set(threads).size).toBe(1)
  const h1 = (await page.getByRole('heading', { level: 1, name: 'People' }).boundingBox())!
  expect(Math.round(h1.x)).toBe(threads[0])

  // The open person's row says so.
  await body.click()
  await expect(page.getByRole('dialog', { name: 'People' })).toBeVisible()
  await expect(body).toHaveAttribute('aria-current', 'page')
})

test('the list is in pinyin order, not byte order', async ({ page }) => {
  await registerFreshUser(page, '/people')
  for (const name of ['王五', '李四', '张三']) await add(page, { name })
  await page.reload()

  // Li is l, Wang is w, Zhang is zh. By code point the three sort 张(24352) 李(26446) 王(29579).
  // `toHaveText` with an array, not `allTextContents`: the latter does not wait, so it reads an
  // empty list while the first fetch is still in flight.
  await expect(page.getByRole('main').locator('li [data-person-name]')).toHaveText([
    '李四',
    '王五',
    '张三',
  ])
})

test('a project page carries its people, as edges and not as a block of its own', async ({
  page,
}) => {
  // This module used to hang a list of its own rows under every project. With four modules doing
  // it the page was a wall of blocks -- the module structure drawn for the reader. The rows are
  // edges now, and one panel draws every kind.
  await registerFreshUser(page, '/')
  const pid = await makeProject(page, '找工作')
  await add(page, {
    name: '某招聘',
    projectIds: [pid],
    channels: [{ kind: 'email', value: 'r@acme.test' }],
  })
  await add(page, { name: '不相干的人' })
  await page.goto(`/projects/${pid}`)

  const people = page
    .getByRole('region', { name: 'Linked' })
    .getByRole('region', { name: 'People' })
  await expect(people).toContainText('某招聘')
  await expect(people).not.toContainText('不相干的人')
  // No block, and so no second way to make a person from here: it is made on their own page. The
  // one region called People is the group inside Linked.
  await expect(page.getByRole('region', { name: 'People' })).toHaveCount(1)
  await expect(page.getByLabel('Add a name')).toHaveCount(0)
})

test('search reaches a person by their address, from the shell box', async ({ page }) => {
  await registerFreshUser(page, '/')
  await add(page, { name: '陈颖', channels: [{ kind: 'email', value: 'ying@acme.test' }] })

  await page.getByRole('button', { name: 'Search' }).click()
  await page.getByRole('combobox', { name: 'Search' }).fill('acme.test')
  await expect(
    page.getByRole('dialog', { name: 'Search' }).getByRole('option').filter({ hasText: '陈颖' }),
  ).toHaveCount(1)
})

test('g n goes to the people, in the one keyspace', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/people$/)
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible()
})

/**
 * Cancel 当这次编辑没发生过 —— 一个字节都不写。
 *
 * 一张表的两个出口：Save 把改动一次写回，Cancel 丢掉。以前每个字段自己存，于是「离开一个没改过
 * 的字段」会发一次什么都没改的 PATCH，列表跟着重排一遍 —— 那条毛病随着那套编辑方式一起没了。
 */
test('Cancel 丢掉改动，一个字节都不写', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖', org: 'Acme 招聘' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })

  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })

  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('textbox', { name: 'Company' }).fill('打错了')
  await pane.getByRole('button', { name: 'Cancel' }).click()

  // 回到阅读态，原来的值还在，而且这一层没有被关掉。
  await expect(pane).toBeVisible()
  await expect(pane).toContainText('Acme 招聘')
  await expect(pane).not.toContainText('打错了')
  expect(writes, 'Cancel 不该写任何东西').toEqual([])
})

test('改完一次保存，读到的就是刚写下的', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖', org: 'Acme 招聘' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })

  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('textbox', { name: 'Company' }).fill('新公司')
  await pane.getByRole('textbox', { name: 'Title' }).fill('技术负责人')
  const written = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/v1/people/'),
  )
  await pane.getByRole('button', { name: 'Save' }).click()

  // 一次请求带走两处改动，不是两次。
  expect((await written).request().postDataJSON()).toMatchObject({
    org: '新公司',
    title: '技术负责人',
  })
  await expect(pane).toContainText('技术负责人 · 新公司')
})

test('a person is written down properly in one form, not created then edited', async ({ page }) => {
  // A name alone is rarely all you know. The one-line box stays for the moment it is; this is
  // the other moment, and it must not mean create-then-open-to-edit.
  await registerFreshUser(page, '/people')
  const hunt = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await hunt.json()) as { id: string }).id

  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('Ying Chen')
  await form.getByLabel('Company').fill('Acme recruiting')
  await form.getByLabel('Address').fill('ying@acme.test')
  await form.getByLabel('Notes').fill('Met at the meetup')
  await form.getByRole('button', { name: 'Add Projects' }).click()
  await page.getByRole('menuitem', { name: 'Job hunt' }).click()

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/people$/.test(r.url()),
  )
  await form.getByRole('button', { name: 'Create' }).click()

  // ONE request carries the whole person.
  expect((await made).request().postDataJSON()).toMatchObject({
    name: 'Ying Chen',
    org: 'Acme recruiting',
    note: 'Met at the meetup',
    projectIds: [projectId],
    channels: [{ kind: 'email', value: 'ying@acme.test', label: null }],
  })
  await expect(row(page, 'Ying Chen')).toContainText('Acme recruiting')
  await expect(page.getByRole('dialog', { name: 'People' })).toContainText('ying@acme.test')
})

test('the whole row opens the person', async ({ page }) => {
  // The whole row is the target, not just the four characters of a name.
  await registerFreshUser(page, '/people')
  await add(page, { name: 'Ying Chen', org: 'Acme recruiting' })
  await page.reload()

  // Not the name: the organisation, which is as far from the name as the row gets.
  await row(page, 'Ying Chen').getByText('Acme recruiting').click()
  await expect(page.getByRole('dialog', { name: 'People' })).toBeVisible()
})

/**
 * 短字段那块网格，两条规则。
 *
 * 一、**列数看这块自己有多宽，不看窗口有多宽**。它住在一根柱子里（详情面板、三栏的中栏），
 * 窗口宽不代表这里宽；按视口断点排两列，就会在 235px 的格子里把「Not on any project」挤成三行。
 * 二、**没有一个标签浮在半空**：网格默认把格子拉到整行高、格子里又垂直居中，于是 Projects 一多
 * 两行，同一行的 Company 就飘到两行中间。
 */
async function fieldGrid(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-person-fields]')
    if (!grid) return null
    const cells = [...grid.children]
    const left = cells[0]?.getBoundingClientRect().left ?? 0
    return {
      width: Math.round(grid.getBoundingClientRect().width),
      // 同一行有几个格子 = 和第一个格子同一行（top 相同）的个数。
      columns: new Set(cells.map((c) => Math.round(c.getBoundingClientRect().left))).size,
      firstLeft: Math.round(left),
      drift: cells.map((cell) => {
        const label = cell.querySelector('span')
        return {
          label: label?.textContent ?? '?',
          off: Math.round(
            (label?.getBoundingClientRect().top ?? 0) - cell.getBoundingClientRect().top,
          ),
        }
      }),
    }
  })
}

/**
 * 列数由这一块自己的宽度决定：窄就一列，够宽配对，再宽三列。
 *
 * 一个标签加六个字不需要 560px，但两列挤在 310px 的面板里会把「Not on any project」折成三行。
 */
const PAIR_AT = 576
const TRIPLE_AT = 672
const columnsFor = (width: number) => (width >= TRIPLE_AT ? 3 : width >= PAIR_AT ? 2 : 1)

test('短字段的列数看这块自己有多宽，不看窗口有多宽', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const projectIds: string[] = []
  for (const name of ['Job hunt', 'CTWS', '开源维护', 'Reading group']) {
    const made = await page.request.post('/api/v1/projects', { headers: WEB, data: { name } })
    projectIds.push(((await made.json()) as { id: string }).id)
  }
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', projectIds, org: 'Acme' },
  })
  const id = ((await made.json()) as { id: string }).id

  // 窗口很宽，这一层只有 400 多：按视口断点排，这里会在 200px 的格子里排三列。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/people/${id}`)
  await expect(page.getByText('Lives in')).toBeVisible()
  const wide = await fieldGrid(page)
  expect(wide!.width).toBeLessThan(TRIPLE_AT)
  expect(wide!.columns).toBe(columnsFor(wide!.width))
  // Projects 占两行时，同一行的那一格不许飘到两行中间。
  expect(wide!.drift.filter((d) => d.off > 6)).toEqual([])

  // 窄窗口：这一层占满屏幕，规则照样是看它自己有多宽。
  await page.setViewportSize({ width: 420, height: 900 })
  await expect(page.getByText('Lives in')).toBeVisible()
  const narrow = await fieldGrid(page)
  expect(narrow!.columns).toBe(columnsFor(narrow!.width))
  expect(narrow!.drift.filter((d) => d.off > 6)).toEqual([])
})

test('新建的时候就能写下生日和 circle，一次请求带走整个人', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('外婆')
  // 生日不是默认摊开的：写一个人常常只有名字，一张摊开的空表单读起来像坏数据。
  await form.getByRole('button', { name: 'Add a birthday' }).click()
  await form
    .getByRole('group', { name: 'Which calendar' })
    .getByRole('button', { name: 'Lunar' })
    .click()
  await form.getByRole('textbox', { name: 'Year' }).fill('1944')
  await pickOne(form, 'Lunar month', '十二月')
  await pickOne(form, 'Lunar day', '三十')
  await pickOne(form, 'Circle', 'Family')

  const posted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/people',
  )
  await form.getByRole('button', { name: 'Create' }).click()
  expect((await posted).request().postDataJSON()).toMatchObject({
    name: '外婆',
    circle: 'family',
    birthday: { calendar: 'lunar', year: 1944, month: 12, day: 30 },
  })
  // 新建后打开的是这一页的详情面板（生日那一页建的人才会跳到他自己的页面）。
  await expect(page.getByText('农历甲申年十二月三十')).toBeVisible()
})

/**
 * 一条很长的链接不能把面板撑宽。
 *
 * 撑宽的后果不是难看而已：整个联系人栏多出一条横向滚动条，列表跟着一起横着滚。值永远截断，
 * 容器的宽度由布局决定，不由内容决定。
 */
test('超长的链接地址被截断，面板一毫米都不变宽', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const short = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '短的', channels: [{ kind: 'email', value: 'a@b.test', label: null }] },
  })
  await page.request.post('/api/v1/people', {
    headers: WEB,
    data: {
      name: '长的',
      channels: [
        {
          kind: 'url',
          value: 'https://sites.google.com/site/hamzawaseem/home/publications-and-talks-2026',
          label: null,
        },
      ],
    },
  })
  expect(short.ok()).toBe(true)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/people')
  await page.getByText('短的').first().click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane).toBeVisible()
  const narrow = (await pane.boundingBox())!.width

  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByText('长的').first().click()
  await expect(pane).toBeVisible()
  await expect(pane.getByText('sites.google.com')).toBeVisible()
  expect((await pane.boundingBox())!.width).toBe(narrow)

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  // 真正要量的是这一行自己：地址有没有被框在它那一格里。
  // `<button>` 是表单控件 —— 就算写了 display:block，宽度仍然按内容算，于是 truncate 永远
  // 没机会生效，文字从按钮底下穿过去。面板不变宽只是因为它自己 overflow 了。
  const clipped = await pane.evaluate((root) => {
    const a = [...root.querySelectorAll('[data-channels] a')].find((el) =>
      (el.textContent ?? '').includes('sites.google.com'),
    ) as HTMLElement | undefined
    if (!a) return null
    return {
      overflows: a.scrollWidth > a.clientWidth,
      right: Math.round(a.getBoundingClientRect().right),
      edge: Math.round(root.getBoundingClientRect().right),
    }
  })
  expect(clipped).not.toBeNull()
  // 长地址必须是被截断的那一个，而且它的右边不许越过这一层自己的边。
  expect(clipped!.overflows).toBe(true)
  expect(clipped!.right).toBeLessThanOrEqual(clipped!.edge)

  // 窄窗口下同一条地址：横向滚动条是这条规则坏掉时最先露出来的东西。
  await page.setViewportSize({ width: 420, height: 900 })
  await expect(pane.getByText('sites.google.com')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
  await page.setViewportSize({ width: 1280, height: 900 })

  // 写的时候也一样：输入框里是同一条长地址，面板照样不许变宽。
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Item 1' })
    .fill('https://sites.google.com/site/hamzawaseem/home/publications-and-talks-2026-really-long')
  expect((await pane.boundingBox())!.width).toBe(narrow)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0)
})

/**
 * 一个人是列表上的一层，不是另一个地方。
 *
 * `/people/<id>` 渲染的是「列表 + 这个人的那一层」——和任务那条路一样（任务从来没有自己的页：
 * `relations.to` 指的是 `/projects?task=<id>`）。URL 留着，反向链接才有地方可去；而列表留在后面，
 * 筛选和滚动位置不会因为看一眼某个人就丢掉。
 */
test('粘一条链接进来，落点是列表加这个人的那一层', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', org: 'Acme recruiting' },
  })
  await page.request.post('/api/v1/people', { headers: WEB, data: { name: '周楠' } })
  const id = ((await made.json()) as { id: string }).id

  await page.goto(`/people/${id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane).toBeVisible()
  await expect(pane).toContainText('陈颖')
  // 列表就在后面，不是一个空页。
  await expect(page.getByRole('heading', { level: 1, name: 'People' })).toBeVisible()
  await expect(personLink(page, '周楠')).toBeVisible()
  // 整页那一套没有了：没有第二个地方可去。
  await expect(page.getByRole('link', { name: 'Open as a page' })).toHaveCount(0)

  // 关掉回到列表，URL 跟着回去。
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page).toHaveURL(/\/people$/)
  await expect(pane).toHaveCount(0)
})

test('从列表点开一个人，URL 就是他的地址', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', { headers: WEB, data: { name: '陈颖' } })
  const id = ((await made.json()) as { id: string }).id
  await page.reload()
  await personLink(page, '陈颖').click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
  // 退回去是浏览器的后退，因为这一层本来就是一次导航。
  await page.goBack()
  await expect(page).toHaveURL(/\/people$/)
})

test('这一层里有 Linked，也有滚到底才看见的删除', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const hunt = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await hunt.json()) as { id: string }).id
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', projectIds: [projectId] },
  })
  const id = ((await made.json()) as { id: string }).id

  await page.goto(`/people/${id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane.getByText('Linked')).toBeVisible()
  await expect(pane.getByRole('link', { name: 'Job hunt' })).toBeVisible()

  // 删除是这一层里最后一个东西：文档顺序上 Linked 在它前面。（屏幕上它贴着底，所以比的是
  // 顺序，不是坐标。）
  const remove = pane.getByRole('button', { name: 'Delete person' })
  const after = await remove.evaluate((el) => {
    const linked = document.querySelector('[aria-label="Linked"]')!
    return (linked.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  })
  expect(after).toBe(true)
  await remove.click()
  // 问一次才算数。
  await expect(pane.getByRole('button', { name: /Delete|Confirm/ }).first()).toBeVisible()
})

/**
 * 三种地址：归堆、按类型写、不许把占位符存成内容。
 *
 * 想到一条加一条，于是真实的列表长成 email link email phone link —— 读起来像没整理过的抽屉。
 * 归堆的次序是 email → phone → link，手写顺序只在同一类里保留（Apple 和 Google 的联系人也是
 * 按类型归堆，都不给手动排序）。
 */
test('地址按类型归堆，不按写下的先后', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: {
      name: '陈颖',
      channels: [
        { kind: 'email', value: 'first@acme.test' },
        { kind: 'url', value: 'acme.test/ying' },
        { kind: 'email', value: 'second@acme.test' },
        { kind: 'phone', value: '+86 139 0000 1234' },
        { kind: 'url', value: 'github.com/ying' },
      ],
    },
  })
  const id = ((await made.json()) as { id: string }).id
  await page.goto(`/people/${id}`)
  await expect(page.locator('[data-channels] li')).toHaveCount(5)
  const kinds = await page.locator('[data-channels] li span:first-child').allTextContents()
  expect(kinds).toEqual(['Email', 'Email', 'Phone', 'Link', 'Link'])
  // 同一类里，先写的还在前面。
  const rows = await page.locator('[data-channels] li a').allTextContents()
  expect(rows[0]).toBe('first@acme.test')
  expect(rows[1]).toBe('second@acme.test')
  // 链接写 host 加路径，不是整条地址。
  expect(rows[3]).toBe('acme.test/ying')
})

test('新加一行是空的，而且说清这一类长什么样', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()

  const box = pane.getByRole('textbox', { name: 'Item 1' })
  // 空的：占位符不是内容，存进去的只能是人写的东西。
  await expect(box).toHaveValue('')
  await expect(box).toHaveAttribute('placeholder', 'name@example.com')

  // 改成电话，占位符跟着变 —— 它们是三种不同的结构化文本。
  await pickOne(pane, 'Type of item 1', 'Phone')
  await expect(box).toHaveAttribute('placeholder', '+86 139 0000 0000')

  // 一行空的不挡保存：加了一行又改主意是常事。
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
  await pane.getByRole('button', { name: 'Save' }).click()
  await expect(pane.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
})

test('写得不像那一类，保存之前就说出来', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()
  await pickOne(pane, 'Type of item 1', 'Phone')
  const box = pane.getByRole('textbox', { name: 'Item 1' })

  /*
    还在这个框里打字的时候一个字都不说。

    `+44` 不是一个打错的号码，是一个还没打完的号码，而红字说的是「你写错了」。按不下 Save 已经
    说了「还不行」，不必再骂一句。（这里一定要真打字：`fill()` 打完会把焦点带走，那就是离开。）
  */
  await box.pressSequentially('+44')
  await expect(pane).not.toContainText('numbers are not that length')
  await expect(pane).not.toContainText('too short')

  await box.fill('')
  await box.pressSequentially('to fill in')
  await expect(pane).not.toContainText('a phone number is digits')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeDisabled()

  // 离开它才说，而且说的是缺的那一条。
  await box.blur()
  await expect(pane).toContainText('a phone number is digits, spaces, dashes and brackets')

  // 粘一条没有国家码的进来：离开它的时候才说，说的还是缺的那一条。
  await box.fill('139 0000 1234')
  await box.blur()
  await expect(pane).toContainText('start with the country code, like +86')

  await box.fill('+86 139 0000 1234')
  await expect(pane).not.toContainText('start with the country code')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
})

test.describe(() => {
  // The pass below guesses a country code from the browser's region; pinned, so the guess is
  // the same on every machine.
  test.use({ locale: 'en-US' })

  /*
    号码那一包晚到，人打的字不被改写。

    它到了之后会把表里的电话过一遍，那是给存下来的号码准备的。以前人这次打的也在其中：
    `139 0000 1234` 被按本机地区补成 `+1 390 000 1234`，红字没了，Save 亮了，存下的是另一个号码。
  */
  test('号码那一包晚到，人打的字不被改写', async ({ page }) => {
    await registerFreshUser(page, '/people')
    await add(page, {
      name: '陈颖',
      channels: [
        { kind: 'phone', value: '+8613900001234' },
        { kind: 'phone', value: '+8613800000000' },
      ],
    })
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/assets/phone-*.js', async (route) => {
      await held
      await route.continue()
    })
    await page.reload()
    await personLink(page, '陈颖').click()
    const pane = page.getByRole('dialog', { name: 'People' })
    await pane.getByRole('button', { name: 'Edit', exact: true }).click()
    // 存下来的那条，重打一遍：打过就是人的字了。
    const box = pane.getByRole('textbox', { name: 'Item 2' })
    await box.fill('139 0000 1234')
    await box.blur()
    await expect(pane).toContainText('start with the country code, like +86')

    release()
    // 到了：存下来的那条排好了。
    await expect(pane.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+86 139 0000 1234')
    await expect(box).toHaveValue('139 0000 1234')
    await expect(pane).toContainText('start with the country code, like +86')
    await expect(pane.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

/**
 * 打进去的号码当场排好。
 *
 * 分组规则按国家走（中国手机 3-4-4，英国固话又不一样），所以交给 libphonenumber-js —— 自己写的
 * 正则只在自己那个国家对。那套元数据只在这张表开着时才取，不进首屏的包。
 */
test('电话一边打一边排好，存下来的就是排好的', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()
  await pane.getByRole('button', { name: 'Add one' }).click()
  await pickOne(pane, 'Type of item 1', 'Phone')

  const box = pane.getByRole('textbox', { name: 'Item 1' })
  // 空框改成电话，国家码已经在里面了 —— 它是必填的，而一个空框不会说这件事。
  await expect(box).toHaveValue(/^\+\d+$/)

  // 带国家码的，排成国际写法 —— 粘一条从别处抄来的号码就是这个样子。
  await box.fill('+8613900001234')
  await expect(box).toHaveValue('+86 139 0000 1234')

  const written = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/v1/people/'),
  )
  await pane.getByRole('button', { name: 'Save' }).click()
  // 存下来的是 E.164：没有空格的那一串，全世界只有一个读法。
  expect((await written).request().postDataJSON()).toMatchObject({
    channels: [{ kind: 'phone', value: '+8613900001234' }],
  })
  // 看到的是分好组的那一串 —— 由存下来的那条算出来，不是存下来的那条本身。
  await expect(pane.getByRole('link', { name: '+86 139 0000 1234' })).toBeVisible()
  // 列表上同一个样子：一个号码长什么样，和它当初从哪个框进来无关。
  await page.reload()
  await expect(page.getByRole('link', { name: '+86 139 0000 1234' }).first()).toBeVisible()
})

/**
 * 家乡和现居是城市，不是一行随便什么字。
 *
 * 打三个字母就给候选，选中之后存下来的是一个标准写法 —— 两个人的「现居」于是不会一个写
 * `Oxford` 一个写 `oxford, uk`。表在服务端（一万五千人以上的三万四千个城市，打进镜像），
 * 所以这件事不看网络脸色，也不把你打的字发给第三方。
 */
test('城市打几个字母就有候选，选中存的是标准写法', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  await pane.getByLabel('Lives in').fill('oxfo')
  await expect(pane.getByRole('button', { name: 'Oxford, England, United Kingdom' })).toBeVisible()
  await pane.getByRole('button', { name: 'Oxford, England, United Kingdom' }).click()
  await expect(pane.getByLabel('Lives in')).toHaveValue('Oxford, England, United Kingdom')

  const written = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' && new URL(r.url()).pathname.startsWith('/api/v1/people/'),
  )
  await pane.getByRole('button', { name: 'Save' }).click()
  expect((await written).request().postDataJSON()).toMatchObject({
    city: 'Oxford, England, United Kingdom',
  })
})

test('打错一个字母看得出来，但还是存得下', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await add(page, { name: '陈颖' })
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  await pane.getByLabel('Hometown').fill('Oxforrd')
  await expect(pane).toContainText('No city by that name')
  // 不拦着：世界上有的是不到一万五千人的地方，挡住一个人写外婆家那个镇不是校验，是添堵。
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
})

/**
 * 从新建对话框写下的号码，和从那一层里写下的一模一样。
 *
 * 这是出过错的地方：排版当初只发生在联系人详情那张表的输入框里，于是从这个对话框进来的号码存成
 * 了打字时的那一串（`+8613800000000`），在任何地方都挤成一条 —— 同一个号码长什么样，取决于它
 * 当初是从哪个框进来的。
 */
test('新建对话框里的号码也排好，存的也是同一条', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('陈颖')
  await pickOne(form, 'Kind', 'Phone')

  const box = form.getByLabel('Address')
  // 国家码已经在框里：必填的东西要先说出来，不能等按下 Create 才说。
  await expect(box).toHaveValue(/^\+\d+$/)
  await box.fill('+8613800000000')
  await expect(box).toHaveValue('+86 138 0000 0000')

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/people$/.test(r.url()),
  )
  await form.getByRole('button', { name: 'Create' }).click()
  expect((await made).request().postDataJSON()).toMatchObject({
    channels: [{ kind: 'phone', value: '+8613800000000' }],
  })

  // 列表上、那一层里，都是分好组的那一串。
  await expect(page.getByRole('link', { name: '+86 138 0000 0000' }).first()).toBeVisible()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane.getByRole('link', { name: '+86 138 0000 0000' })).toBeVisible()
})

test('没有国家码的号码，新建对话框也不收', async ({ page }) => {
  await registerFreshUser(page, '/people')
  await page.getByRole('button', { name: 'New person' }).click()
  const form = page.getByRole('dialog', { name: 'New person' })
  await form.getByLabel('Name').fill('陈颖')
  await pickOne(form, 'Kind', 'Phone')
  // 真打字：`fill()` 打完会把焦点带走，那就是离开，而这一条说的正是「还在框里的时候」。
  await form.getByLabel('Address').fill('')
  await form.getByLabel('Address').pressSequentially('13800000000')

  // 还在框里就不挑错。
  await expect(form).not.toContainText('start with the country code')
  await form.getByLabel('Address').blur()
  await expect(form).toContainText('start with the country code, like +86')
  await expect(form.getByRole('button', { name: 'Create' })).toBeDisabled()
})

/**
 * 存在表里的老号码没有国家码，打开那张表就补上。
 *
 * 不补的话这个人就卡住了：现在没有国家码的号码过不了校验，而那张表总是把所有联系方式一起写回，
 * 于是改他的名字也按不动 Save，而红字说的是一个他从没打开过的框。
 */
test('老号码打开编辑就补上国家码', async ({ page }) => {
  await registerFreshUser(page, '/people')
  const made = await page.request.post('/api/v1/people', {
    headers: WEB,
    data: { name: '陈颖', channels: [{ kind: 'phone', value: '+1 (730) 197-4443' }] },
  })
  expect(made.ok()).toBe(true)
  await page.reload()
  await personLink(page, '陈颖').click()
  const pane = page.getByRole('dialog', { name: 'People' })
  await pane.getByRole('button', { name: 'Edit', exact: true }).click()

  await expect(pane.getByRole('textbox', { name: 'Item 1' })).toHaveValue('+1 730 197 4443')
  await expect(pane.getByRole('button', { name: 'Save' })).toBeEnabled()
})

/** On a phone the margin is 60px: a birthday's date stays inside it, and so the page's edge. */
test('a birthday fits the phone margin', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await registerFreshUser(page, '/')
  // May 28: the widest month-and-day the margin has to hold, on any day the suite runs.
  await add(page, { name: '陈颖', birthday: { calendar: 'solar', month: 5, day: 28 } })
  await page.goto('/people')
  const lead = page.locator('[data-person-row] [data-birthday-lead]')
  await expect(lead.locator('time')).toHaveText('May 28')
  expect(await lead.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
})
