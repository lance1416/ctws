import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * ONE PAGE FOR EVERY KIND OF THING.
 *
 * A person's page did not exist: a contact was a row with a pane over it, and the meetings they
 * were in, the book they recommended and the task that came out of a call with them had nowhere
 * to be shown. What is tested here is that the shell draws ONE page for a project, a person and a
 * meeting alike -- the module fills the top, the shell fills the rest from the edge table -- and
 * that following a link from one lands on another.
 */

async function world(page: Page) {
  await registerFreshUser(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  const person = await apiPost(page, '/contacts', {
    name: 'Ying Chen',
    org: 'Acme recruiting',
    projectIds: [project.id],
  })
  // A task, so the exclusion below is about a group that WOULD otherwise be there.
  await apiPost(page, '/tasks', { projectId: project.id, title: 'Rewrite the CV', parentId: null })
  const book = await apiPost(page, '/reading', {
    kind: 'book',
    title: 'The Design of Everyday Things',
  })
  await apiPost(page, '/links', {
    from: { type: 'contact', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  const meeting = await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: '2026-10-20T21:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    projectId: project.id,
    attendeeIds: [person.id],
  })
  return { project, person, meeting }
}

/**
 * 一个人、一场会：**一层**，不是一个地方。
 *
 * 模块写它是什么，shell 写它连着什么 —— 这两半还是原来那两半，只是不再占掉整个窗口。项目保留
 * 整页：它是你工作的地方，有一棵会拖会折的任务树，而人和会议是你瞥一眼的记录。
 */
test('一个人的那一层里，模块写字段、shell 写边', async ({ page }) => {
  const { person } = await world(page)
  await page.goto(`/contacts/${person.id}`)

  const layer = page.getByRole('dialog', { name: 'Contacts' })
  await expect(layer).toContainText('Ying Chen')
  await expect(layer).toContainText('Acme recruiting')

  // 边是从另一端读出来的：客人名单写在会议上，推荐写在一张表的一行里。
  const linked = layer.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'Meetings' })).toContainText('Second interview')
  await expect(linked.getByRole('region', { name: 'Reading' })).toContainText(
    'The Design of Everyday Things',
  )
  await expect(linked.getByRole('region', { name: 'Projects' })).toContainText('Job hunt')
})

test('从一个人跟着边走到一场会，落点是会议的那一层', async ({ page }) => {
  const { person, meeting } = await world(page)
  await page.goto(`/contacts/${person.id}`)
  await page.getByRole('link', { name: /Second interview/ }).click()

  await expect(page).toHaveURL(new RegExp(`/meetings/${meeting.meetingId}$`))
  await expect(page.getByRole('dialog', { name: 'Meetings' })).toContainText('Second interview')
  // 列表就在后面：从一条边过来的人，下一步多半还在这个列表里。
  await expect(page.getByRole('heading', { level: 1, name: 'Meetings' })).toBeVisible()
})

test('指向一个已经不在的人，说出来而不是空着', async ({ page }) => {
  await registerFreshUser(page)
  await page.goto('/contacts/99999999-9999-4999-8999-999999999999')
  await expect(page.getByText('This person is not here any more.')).toBeVisible()
})

test('项目页是单栏：Linked 在正文下面', async ({ page }) => {
  const { project } = await world(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/projects/${project.id}`)
  const glance = await page.getByRole('region', { name: 'Project at a glance' }).boundingBox()
  const linked = await page.getByRole('region', { name: 'Linked' }).boundingBox()
  expect(linked!.y).toBeGreaterThan(glance!.y)
  // 一栏：两块左边对齐，宽度一样。
  expect(Math.round(linked!.x)).toBe(Math.round(glance!.x))
  expect(Math.round(linked!.width)).toBe(Math.round(glance!.width))
})

test('项目页不被改成两栏：它自己的块已经把宽度用掉了', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = (await apiPost(page, '/projects', { name: '求职' })).id as string
  await page.goto(`/projects/${pid}`)
  const glance = (await page.getByRole('region', { name: 'Project at a glance' }).boundingBox())!
  const linked = (await page.getByRole('region', { name: 'Linked' }).boundingBox())!
  // Below, and the same width: the third column on this page belongs to the task detail pane.
  expect(linked.y).toBeGreaterThan(glance.y + glance.height - 4)
  expect(Math.round(linked.width)).toBe(Math.round(glance.width))
})
