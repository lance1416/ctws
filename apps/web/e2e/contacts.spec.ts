import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * 联系人 -- THE THIRD MODULE.
 *
 * Two things are under test. The vCard claim: a person has SEVERAL ways to be reached, and they
 * are links rather than text to copy. And the seam claim: a third module registered without the
 * contract changing at all.
 */

const HEADERS = { 'x-ctws-client': 'web' }

const row = (page: Page, name: string) =>
  page.getByRole('listitem').filter({ hasText: name }).first()

async function project(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  return ((await res.json()) as { id: string }).id
}

const add = (page: Page, data: Record<string, unknown>) =>
  page.request.post('/api/v1/contacts', { headers: HEADERS, data })

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

test('a contact is made and edited in a dialog, addresses and all', async ({ page }) => {
  await registerFreshUser(page, '/contacts')

  // Scoped and exact: the rail carries a 新建项目 button on every page.
  await page.getByRole('main').getByRole('button', { name: '新建', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建联系人' })
  await dialog.getByLabel('姓名').fill('李雷')
  await dialog.getByRole('button', { name: '加一项' }).click()
  await dialog.getByLabel('第 1 项', { exact: true }).fill('lilei@acme.test')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(row(page, '李雷')).toContainText('lilei@acme.test')

  // Editing opens on the person, and a second address is added to the set.
  await page.getByRole('button', { name: '李雷' }).click()
  const editing = page.getByRole('dialog', { name: '编辑联系人' })
  await editing.getByRole('button', { name: '加一项' }).click()
  await editing.getByLabel('第 2 项的类型').selectOption('phone')
  await editing.getByLabel('第 2 项', { exact: true }).fill('13800000000')
  await editing.getByRole('button', { name: '保存' }).click()

  await expect(row(page, '李雷')).toContainText('lilei@acme.test')
  await expect(row(page, '李雷')).toContainText('13800000000')
})

test('an address removed in the dialog is really gone', async ({ page }) => {
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
  await page.getByRole('dialog').getByRole('button', { name: '删掉第 1 项' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()

  await expect(row(page, '韩梅梅')).toContainText('keep@acme.test')
  await expect(row(page, '韩梅梅')).not.toContainText('old@acme.test')
})

test('the list is in pinyin order, not byte order', async ({ page }) => {
  await registerFreshUser(page, '/contacts')
  for (const name of ['王五', '李四', '张三']) await add(page, { name })
  await page.reload()

  // 李 is l, 王 is w, 张 is zh. By code point it would be 张(24352) 李(26446) 王(29579).
  // `toHaveText` with an array, not `allTextContents`: the latter does not wait, so it reads an
  // empty list while the first fetch is still in flight.
  await expect(page.getByRole('main').locator('li button')).toHaveText(['李四', '王五', '张三'])
})

test('a project page carries its people, and the module brought its own 新建', async ({ page }) => {
  await registerFreshUser(page, '/')
  const pid = await project(page, '找工作')
  await add(page, {
    name: '某招聘',
    projectId: pid,
    channels: [{ kind: 'email', value: 'r@acme.test' }],
  })
  await add(page, { name: '不相干的人' })
  await page.goto(`/projects/${pid}`)

  const block = page.getByRole('region', { name: '联系人' })
  await expect(block).toContainText('某招聘')
  await expect(block).not.toContainText('不相干的人')
  // The project you are standing in is not named again on the row.
  await expect(block).not.toContainText('找工作')
  await expect(block.getByRole('button', { name: '新建', exact: true })).toBeVisible()
})

test('search reaches a person by their address, from the shell box', async ({ page }) => {
  await registerFreshUser(page, '/')
  await add(page, { name: '陈颖', channels: [{ kind: 'email', value: 'ying@acme.test' }] })

  await page.getByRole('button', { name: '搜索' }).click()
  await page.getByRole('combobox', { name: '搜索' }).fill('acme.test')
  await expect(
    page.getByRole('dialog', { name: '搜索' }).getByRole('option').filter({ hasText: '陈颖' }),
  ).toHaveCount(1)
})

test('g n goes to the contacts, in the one keyspace', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page.keyboard.press('g')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/contacts$/)
  await expect(page.getByRole('heading', { name: '联系人', level: 1 })).toBeVisible()
})
