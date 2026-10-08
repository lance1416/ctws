import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * 工作台 -- THE SHELL'S OWN FRONT PAGE.
 *
 * The claim under test is not that the page renders: it is that the page belongs to NOBODY, and
 * that its cards and the project pages do not show each other's rows. A workbench card that
 * repeated what is already on a project page would make two places to keep in your head.
 */

const HEADERS = { 'x-ctws-client': 'web' }

const card = (page: Page, name: string) => page.getByRole('region', { name })

async function project(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  return ((await res.json()) as { id: string }).id
}

test('signing in lands on the workbench, not inside a module', async ({ page }) => {
  await registerFreshUser(page, '/')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: '工作台', level: 1 })).toBeVisible()
  // Every module has a card here, and the shell has its own.
  await expect(card(page, '正在做')).toBeVisible()
  await expect(card(page, '待读 · 散的')).toBeVisible()
  await expect(card(page, '项目')).toBeVisible()
})

test('the 待读 card holds only what belongs to no project', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, 'CTWS')
  await page.request.post('/api/v1/reading', {
    headers: HEADERS,
    data: { kind: 'book', title: '散着的书' },
  })
  await page.request.post('/api/v1/reading', {
    headers: HEADERS,
    data: { kind: 'book', title: '归了项目的书', projectId: pid },
  })
  await page.goto('/')

  const reading = card(page, '待读 · 散的')
  await expect(reading).toContainText('散着的书')
  // THE DIVISION OF LABOUR: what is filed under a project lives on that project's page, and this
  // card does not repeat it.
  await expect(reading).not.toContainText('归了项目的书')

  await page.goto(`/projects/${pid}`)
  await expect(page.getByText('归了项目的书')).toBeVisible()
  await expect(page.getByText('散着的书')).toHaveCount(0)
})

test('an item whose project was deleted turns up on the card rather than nowhere', async ({
  page,
}) => {
  // Projects are soft-deleted, so without this the item would be absent from every project page
  // AND from the card -- in the database and on no screen.
  await registerFreshUser(page, '/')
  const pid = await project(page, '要删掉的')
  await page.request.post('/api/v1/reading', {
    headers: HEADERS,
    data: { kind: 'book', title: '留下来的书', projectId: pid },
  })
  await page.request.delete(`/api/v1/projects/${pid}`, { headers: HEADERS })
  await page.goto('/')
  await expect(card(page, '待读 · 散的')).toContainText('留下来的书')
})

test('the 正在做 card shows what is in progress, across projects', async ({ page }) => {
  await registerFreshUser(page, '/')
  const a = await project(page, 'CTWS')
  const b = await project(page, 'rrgen')
  const task = async (projectId: string, title: string, status?: string) => {
    const res = await page.request.post('/api/v1/tasks', {
      headers: HEADERS,
      data: { projectId, title, parentId: null },
    })
    const { id } = (await res.json()) as { id: string }
    if (status)
      await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: { status } })
  }
  await task(a, '配色重做', 'in_progress')
  await task(b, '跑通 CI', 'in_progress')
  await task(a, '还没开始的')
  await page.goto('/')

  const doing = card(page, '正在做')
  await expect(doing).toContainText('配色重做')
  await expect(doing).toContainText('跑通 CI')
  await expect(doing).not.toContainText('还没开始的')
})

test('g w goes to the workbench, and it is the shell own key', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('t')
  await expect(page).toHaveURL(/\/tasks\/today$/)
  await page.keyboard.press('g')
  await page.keyboard.press('w')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: '工作台', level: 1 })).toBeVisible()
})
