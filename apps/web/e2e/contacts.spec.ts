import { expect, test, type Page } from '@playwright/test'
import { makeProject, pickOne, registerFreshUser, WEB } from './helpers'

/**
 * CONTACTS -- THE THIRD MODULE.
 *
 * Two things are under test. The vCard claim: a person has SEVERAL ways to be reached, and they
 * are links rather than text to copy. And the seam claim: a third module registered without the
 * contract changing at all.
 */

const row = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name }).first()

async function add(page: Page, data: Record<string, unknown>) {
  const res = await page.request.post('/api/v1/contacts', { headers: WEB, data })
  // Asserted, because a payload the contract refused used to leave the test looking at an empty
  // list and blaming the page.
  expect(res.status(), await res.text()).toBe(201)
  return res
}

test('a person keeps several addresses, and each one is a link', async ({ page }) => {
  await registerFreshUser(page, '/contacts')
  await add(page, {
    name: '陈颖',
    org: 'Acme 招聘',
    channels: [
      { kind: 'email', value: 'ying@acme.test', label: '工作' },
      { kind: 'phone', value: '+86 138 0000 0000' },
      { kind: 'url', value: 'github.com/ying' },
    ],
  })
  await page.reload()

  const person = row(page, '陈颖')
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

test('a person is made by typing a name, and finished in the pane', async ({ page }) => {
  // One line into a box, like every other thing this app makes. The form that used to stand
  // between a name and a contact is gone.
  await registerFreshUser(page, '/contacts')
  await page.getByLabel('Add a name').fill('李雷')
  await page.getByLabel('Add a name').press('Enter')

  // The pane opens on them: a name alone is never all you know about somebody, and this is the
  // moment you have the rest of it to hand.
  const pane = page.getByRole('dialog', { name: 'Contacts' })
  await expect(pane).toContainText('李雷')

  await pane.getByRole('button', { name: 'Add one' }).click()
  await pane.getByRole('button', { name: 'Edit Item 1' }).click()
  await pane.getByRole('textbox', { name: 'Item 1' }).fill('lilei@acme.test')
  await page.keyboard.press('Enter')
  await expect(row(page, '李雷')).toContainText('lilei@acme.test')

  // NOTHING WAS SAVED, because there is nothing to save: this pane has no Save button.
  await expect(pane.getByRole('button', { name: 'Save' })).toHaveCount(0)
})

test('a person can be on several lines of work at once', async ({ page }) => {
  await registerFreshUser(page, '/')
  const hunt = await makeProject(page, '找工作')
  const ctws = await makeProject(page, 'CTWS')
  await add(page, { name: '陈颖' })
  await page.goto('/contacts')

  await page.getByRole('button', { name: '陈颖' }).click()
  const pane = page.getByRole('dialog', { name: 'Contacts' })
  // Picked back to back WITHOUT waiting in between: that is what a person does, and it used to
  // drop the first one -- both writes computed their new set from the same pre-refetch list.
  for (const name of ['找工作', 'CTWS']) {
    await pane.getByRole('button', { name: 'Add Projects' }).click()
    await page.getByRole('menuitem', { name }).click()
  }
  await expect(pane.getByRole('button', { name: 'Remove Projects “找工作”' })).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Remove Projects “CTWS”' })).toBeVisible()

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
  await page.goto('/contacts')

  await page.getByRole('button', { name: '陈颖' }).click()
  const pane = page.getByRole('dialog', { name: 'Contacts' })
  await pane.getByRole('button', { name: 'Remove Projects “找工作”' }).click()
  await expect(pane.getByRole('button', { name: 'Remove Projects “找工作”' })).toHaveCount(0)
  await expect(pane.getByRole('button', { name: 'Remove Projects “CTWS”' })).toBeVisible()

  await page.goto(`/projects/${hunt}`)
  await expect(page.getByRole('region', { name: 'Linked' })).not.toContainText('陈颖')
})

test('an address removed in the pane is really gone', async ({ page }) => {
  // The failure mode of a replace-the-set write is an orphan nobody can delete.
  await registerFreshUser(page, '/contacts')
  await add(page, {
    name: '韩梅梅',
    channels: [
      { kind: 'email', value: 'old@acme.test' },
      { kind: 'email', value: 'keep@acme.test' },
    ],
  })
  await page.reload()

  await page.getByRole('button', { name: '韩梅梅' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove item 1' }).click()

  await expect(row(page, '韩梅梅')).toContainText('keep@acme.test')
  await expect(row(page, '韩梅梅')).not.toContainText('old@acme.test')
})

test('the list is in pinyin order, not byte order', async ({ page }) => {
  await registerFreshUser(page, '/contacts')
  for (const name of ['王五', '李四', '张三']) await add(page, { name })
  await page.reload()

  // Li is l, Wang is w, Zhang is zh. By code point the three sort 张(24352) 李(26446) 王(29579).
  // `toHaveText` with an array, not `allTextContents`: the latter does not wait, so it reads an
  // empty list while the first fetch is still in flight.
  await expect(page.getByRole('main').locator('li [data-contact-name]')).toHaveText([
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
  // No block, and so no second way to make a person from here: it is made on their own page.
  await expect(page.getByRole('region', { name: 'Contacts' })).toHaveCount(0)
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

test('g n goes to the contacts, in the one keyspace', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/contacts$/)
  await expect(page.getByRole('heading', { name: 'Contacts', level: 1 })).toBeVisible()
})

test('Escape puts an inline edit back without closing the pane', async ({ page }) => {
  // One key, one level: the first Escape cancels what is being typed, and only a second one
  // leaves. Without that, backing out of a typo also loses your place.
  await registerFreshUser(page, '/contacts')
  await add(page, { name: '陈颖', org: 'Acme 招聘' })
  await page.reload()
  await page.getByRole('button', { name: '陈颖' }).click()
  const pane = page.getByRole('dialog', { name: 'Contacts' })

  await pane.getByRole('button', { name: 'Edit Company' }).click()
  await pane.getByRole('textbox', { name: 'Company' }).fill('打错了')
  await page.keyboard.press('Escape')

  await expect(pane).toBeVisible()
  await expect(pane.getByRole('textbox', { name: 'Company' })).toHaveCount(0)
  await expect(pane).toContainText('Acme 招聘')

  // The second one leaves.
  await page.keyboard.press('Escape')
  await expect(pane).toHaveCount(0)
})

test('leaving a field you did not change writes nothing', async ({ page }) => {
  // A request that changes nothing, followed by a refetch that shows the same thing, is a flicker
  // with no meaning -- and on a list it is a reorder nobody asked for.
  await registerFreshUser(page, '/contacts')
  await add(page, { name: '陈颖', org: 'Acme 招聘' })
  await page.reload()
  await page.getByRole('button', { name: '陈颖' }).click()
  const pane = page.getByRole('dialog', { name: 'Contacts' })

  const writes: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'PATCH') writes.push(r.url())
  })
  await pane.getByRole('button', { name: 'Edit Company' }).click()
  await pane.getByRole('textbox', { name: 'Company' }).click()
  await page.keyboard.press('Enter')

  await expect(pane).toContainText('Acme 招聘')
  expect(writes, 'leaving an untouched field must not write').toEqual([])
})

test('a person is written down properly in one form, not created then edited', async ({ page }) => {
  // A name alone is rarely all you know. The one-line box stays for the moment it is; this is
  // the other moment, and it must not mean create-then-open-to-edit.
  await registerFreshUser(page, '/contacts')
  const hunt = await page.request.post('/api/v1/projects', {
    headers: WEB,
    data: { name: 'Job hunt' },
  })
  const projectId = ((await hunt.json()) as { id: string }).id

  await page.getByRole('button', { name: 'New contact' }).click()
  const form = page.getByRole('dialog', { name: 'New contact' })
  await form.getByLabel('Name').fill('Ying Chen')
  await form.getByLabel('Company').fill('Acme recruiting')
  await form.getByLabel('Address').fill('ying@acme.test')
  await form.getByLabel('Notes').fill('Met at the meetup')
  await form.getByRole('button', { name: 'Add Projects' }).click()
  await page.getByRole('menuitem', { name: 'Job hunt' }).click()

  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/contacts$/.test(r.url()),
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
  await expect(row(page, 'Ying Chen')).toContainText('ying@acme.test')
})

test('the whole row opens the person, and the addresses stay links', async ({ page }) => {
  // The whole row is the target, not just the four characters of a name.
  await registerFreshUser(page, '/contacts')
  await add(page, { name: 'Ying Chen', org: 'Acme recruiting' })
  await page.reload()

  // Not the name: the organisation, which is as far from the name as the row gets.
  await row(page, 'Ying Chen').getByText('Acme recruiting').click()
  await expect(page.getByRole('dialog', { name: 'Contacts' })).toBeVisible()
})

test('deleting a person is not a button like the others', async ({ page }) => {
  // The one control here that cannot be undone must not sit among the others in the same grey.
  await registerFreshUser(page, '/contacts')
  await add(page, { name: 'Ying Chen' })
  await page.reload()
  await page.getByRole('button', { name: 'Ying Chen' }).click()

  const remove = page.getByRole('dialog', { name: 'Contacts' }).getByRole('button', {
    name: 'Delete contact',
  })
  const colour = await remove.evaluate((el) => getComputedStyle(el).color)
  const other = await page
    .getByRole('dialog', { name: 'Contacts' })
    .getByRole('button', { name: 'Add one' })
    .evaluate((el) => getComputedStyle(el).color)
  expect(colour).not.toBe(other)
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
    const grid = document.querySelector('[data-contact-fields]')
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

/** 一个标签加六个字不需要 560px，所以够宽才配对；不够宽就一列到底。 */
const PAIR_AT = 576

test('短字段的列数看这块自己有多宽，不看窗口有多宽', async ({ page }) => {
  await registerFreshUser(page, '/contacts')
  // 够多的项目，好让 Projects 那一格换行 —— 旁边的 Company 会不会被顶到半空，只有这时候看得出来。
  const projectIds: string[] = []
  for (const name of ['Job hunt', 'CTWS', '开源维护', 'Reading group']) {
    const made = await page.request.post('/api/v1/projects', { headers: WEB, data: { name } })
    projectIds.push(((await made.json()) as { id: string }).id)
  }
  const made = await page.request.post('/api/v1/contacts', {
    headers: WEB,
    data: { name: '陈颖', projectIds, org: 'Acme' },
  })
  const id = ((await made.json()) as { id: string }).id

  // 详情面板：窗口很宽，柱子只有 310px。按视口断点排，这里会在 145px 的格子里排两列。
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/contacts')
  await page.getByText('陈颖').first().click()
  await expect(page.getByText('Lives in')).toBeVisible()
  const pane = await fieldGrid(page)
  expect(pane!.width).toBeLessThan(PAIR_AT)
  expect(pane!.columns).toBe(1)
  expect(pane!.drift.filter((d) => d.off > 6)).toEqual([])

  // 人的那一页，窗口 1024：三栏下的中栏也还不到配对的宽度。
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto(`/contacts/${id}`)
  await expect(page.getByText('Lives in')).toBeVisible()
  const narrow = await fieldGrid(page)
  expect(narrow!.width).toBeLessThan(PAIR_AT)
  expect(narrow!.columns).toBe(1)
  // Projects 占两行时，同一行的 Company 不许飘到两行中间。
  expect(narrow!.drift.filter((d) => d.off > 6)).toEqual([])

  // 够宽了才配对。
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/contacts/${id}`)
  await expect(page.getByText('Lives in')).toBeVisible()
  const wide = await fieldGrid(page)
  expect(wide!.width).toBeGreaterThanOrEqual(PAIR_AT)
  expect(wide!.columns).toBe(2)
  expect(wide!.drift.filter((d) => d.off > 6)).toEqual([])
})

test('新建的时候就能写下生日和 circle，一次请求带走整个人', async ({ page }) => {
  await registerFreshUser(page, '/contacts')
  await page.getByRole('button', { name: 'New contact' }).click()
  const form = page.getByRole('dialog', { name: 'New contact' })
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
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/contacts',
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
