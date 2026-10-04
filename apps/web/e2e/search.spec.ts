import { expect, test, type Page } from '@playwright/test'
import { openProject, registerFreshUser, submitCreate } from './helpers'

/** The row's focus carrier in the tree; its accessible name is the task title. */
const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `任务：${title}`, exact: true })

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

const searchBox = (page: Page) => page.getByRole('textbox', { name: '搜索任务' })

/** Creates a project through the UI and returns its url. */
async function startProject(page: Page, name: string) {
  await page.getByRole('link', { name: '项目' }).click()
  await submitCreate(page, '新项目', name)
  await openProject(page, name, true)
  return page.url()
}

/** Builds tasks through the API (far faster than the UI). Returns the ids by title. */
async function seed(page: Page, url: string, spec: [title: string, parent: string | null][]) {
  const projectId = url.split('/').pop()!
  const ids = new Map<string, string>()
  for (const [title, parent] of spec) {
    const res = await page.request.post('/api/v1/tasks', {
      headers: { 'x-ctws-client': 'web' },
      data: { projectId, title, parentId: parent ? ids.get(parent)! : null },
    })
    expect(res.ok()).toBeTruthy()
    ids.set(title, ((await res.json()) as { id: string }).id)
  }
  return ids
}

/** Types into the search box and waits for the server's answer, so no assertion races the fetch. */
async function query(page: Page, text: string) {
  const answered = page.waitForResponse((r) => r.url().includes('/api/v1/search?q=') && r.ok(), {
    timeout: 15_000,
  })
  await searchBox(page).fill(text)
  await answered
}

const result = (page: Page, title: string) =>
  page.getByRole('dialog', { name: '搜索任务' }).getByRole('button').filter({ hasText: title })

// The case the browser's own Ctrl+F cannot do: a collapsed row is not in the DOM at all, so there
// is nothing on the page for the browser to find. If this test ever passes with the subtree left
// expanded it proves nothing, so the collapse is asserted (the child row is GONE) before searching.
test('search finds a task inside a collapsed subtree and leaves it visible and focused', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Deep')
  await seed(page, url, [
    ['外层', null],
    ['中层', '外层'],
    ['藏起来的针', '中层'],
  ])
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveCount(3)

  // Fold the top of the chain: both descendants leave the DOM.
  await row(page, '外层').getByRole('button', { name: '折叠' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(handle(page, '藏起来的针')).toHaveCount(0)
  // And the browser could not find it either: the text is not on the page.
  expect(await page.locator('body').innerText()).not.toContain('藏起来的针')

  // Leave the project entirely, so nothing about this is "already on the right page".
  await page.getByRole('link', { name: '今天' }).click()
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()

  await page.keyboard.press('f')
  await query(page, '针')
  await expect(result(page, '藏起来的针')).toBeVisible()
  await page.keyboard.press('Enter')

  // Routed to the project AND the row is on screen, not hidden behind a folded parent.
  await expect(page).toHaveURL(new RegExp(`/projects/${url.split('/').pop()!}`))
  const target = handle(page, '藏起来的针')
  await expect(target).toBeVisible()
  await expect(row(page, '藏起来的针')).toBeInViewport()
  // Focus lands on it, so the very next keystroke acts on the task that was looked for.
  await expect(target).toBeFocused()
  // Both ancestors were unfolded, not just the one that was clicked.
  await expect(row(page, '外层').getByRole('button', { name: '展开' })).toHaveCount(0)
  await expect(row(page, '中层').getByRole('button', { name: '展开' })).toHaveCount(0)

  // The reveal is consumed: the url is clean, so folding it again is not undone on the next render.
  await expect(page).not.toHaveURL(/reveal=/)
  await row(page, '外层').getByRole('button', { name: '折叠' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
})

test('search reaches a task in a project other than the one being viewed', async ({ page }) => {
  await registerFreshUser(page)
  const alpha = await startProject(page, 'Alpha')
  await seed(page, alpha, [['alpha 的活', null]])
  const beta = await startProject(page, 'Beta')
  await seed(page, beta, [['beta 的活', null]])

  // Standing on Beta, looking for something in Alpha.
  await page.goto(beta)
  await expect(page.getByRole('listitem')).toHaveCount(1)

  await page.keyboard.press('f')
  await query(page, '的活')
  // Both projects answered, and each result says which project it is in.
  await expect(result(page, 'alpha 的活')).toContainText('Alpha')
  await expect(result(page, 'beta 的活')).toContainText('Beta')

  await result(page, 'alpha 的活').click()
  await expect(page).toHaveURL(new RegExp(`/projects/${alpha.split('/').pop()!}`))
  await expect(handle(page, 'alpha 的活')).toBeFocused()
})

test('search shows the parent breadcrumb and the status, and skips deleted tasks', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Ctx')
  const ids = await seed(page, url, [
    ['迁移计划', null],
    ['hint 的子任务', '迁移计划'],
    ['hint 已完成', null],
    ['hint 删掉的', null],
  ])
  const done = await page.request.patch(`/api/v1/tasks/${ids.get('hint 已完成')!}`, {
    headers: { 'x-ctws-client': 'web' },
    data: { status: 'done' },
  })
  expect(done.ok()).toBeTruthy()
  const removed = await page.request.delete(`/api/v1/tasks/${ids.get('hint 删掉的')!}`, {
    headers: { 'x-ctws-client': 'web' },
  })
  expect(removed.ok()).toBeTruthy()

  await page.keyboard.press('f')
  await query(page, 'hint')

  // `项目 › 父任务`, exactly as the today and completed lists write it.
  await expect(result(page, 'hint 的子任务')).toContainText('Ctx › 迁移计划')
  // A finished task is findable on purpose -- and says so, so it is not mistaken for live work.
  await expect(result(page, 'hint 已完成')).toContainText('已完成')
  // Deleted is the one thing search does not return.
  await expect(result(page, 'hint 删掉的')).toHaveCount(0)
})

test('Escape closes search, and f typed into a text field does not open it', async ({ page }) => {
  await registerFreshUser(page)

  await page.keyboard.press('f')
  await expect(searchBox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(searchBox(page)).toHaveCount(0)

  // Opened from the header button instead: closing returns focus to it rather than dropping to
  // <body> (WCAG 2.4.3), which is the behaviour the rest of this app already holds to.
  await page.getByRole('button', { name: '搜索' }).click()
  await expect(searchBox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '搜索' })).toBeFocused()

  // The guard every document-level key needs: in the capture box, `f` is a letter.
  await page.getByLabel('捕获').fill('')
  await page.getByLabel('捕获').press('f')
  await expect(searchBox(page)).toHaveCount(0)
  await expect(page.getByLabel('捕获')).toHaveValue('f')
})
