import { expect, test, type Page } from '@playwright/test'
import { apiPost, registerFreshUser } from './helpers'

/**
 * SAYING THAT TWO THINGS ARE CONNECTED, from the interface.
 *
 * The edge table shipped with no way to write an edge: the server took one and nothing in the app
 * sent one, so the sentence the whole redesign exists for -- "this book is the one Ying
 * recommended" -- was reachable with curl and nowhere else. Every edge that existed came from a
 * module's own field.
 */
const picker = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Link to' })

async function world(page: Page) {
  await registerFreshUser(page)
  const person = await apiPost(page, '/contacts', { name: 'Ying Chen', org: 'Acme recruiting' })
  const book = await apiPost(page, '/reading', {
    kind: 'book',
    title: 'The Design of Everyday Things',
  })
  return { person, book }
}

test('a book can be marked as the one someone recommended', async ({ page }) => {
  const { person, book } = await world(page)
  await page.goto(`/contacts/${person.id}`)
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  await page.getByRole('button', { name: '+ Link' }).click()
  await picker(page).getByLabel('Search').fill('Everyday')
  await picker(page)
    .getByRole('button', { name: /The Design of Everyday Things/ })
    .click()

  // The SECOND question, which cannot be guessed: a person and a book can be joined two ways.
  await expect(page.getByRole('dialog').filter({ hasText: 'How is it related?' })).toBeVisible()
  const made = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/api\/v1\/links$/.test(r.url()),
  )
  await page.getByRole('button', { name: 'recommended', exact: true }).click()
  expect((await made).request().postDataJSON()).toEqual({
    from: { type: 'contact', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })

  const linked = page.getByRole('region', { name: 'Linked' })
  await expect(linked.getByRole('region', { name: 'Reading' })).toContainText(
    'The Design of Everyday Things',
  )
})

test('the edge reads from both ends, written once', async ({ page }) => {
  const { person, book } = await world(page)
  await apiPost(page, '/links', {
    from: { type: 'contact', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })

  // Nothing was written on the BOOK, and the book's module has no page of its own -- so this is
  // read on the person, and on the reading list the item simply exists. One row, two readings.
  await page.goto(`/contacts/${person.id}`)
  const row = page.getByRole('region', { name: 'Reading' })
  await expect(row).toContainText('The Design of Everyday Things')
  await expect(row).toContainText('recommended')
})

test('an edge is taken off from either end, whichever way it was written', async ({ page }) => {
  // The stored row runs one way. On the person's page the recommendation runs OUT of them and
  // the meeting they attend runs IN -- and unlinking has to name the ends the way the row has
  // them, or it deletes nothing and the row comes back on the next read.
  const { person, book } = await world(page)
  await apiPost(page, '/links', {
    from: { type: 'contact', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: '2026-10-20T21:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
    attendeeIds: [person.id],
  })

  await page.goto(`/contacts/${person.id}`)
  // INCOMING: the guest list was written on the meeting.
  await page.getByRole('button', { name: 'Unlink Second interview' }).click()
  await expect(page.getByRole('region', { name: 'Meetings' })).toHaveCount(0)
  // OUTGOING: the recommendation was written here.
  await page.getByRole('button', { name: 'Unlink The Design of Everyday Things' }).click()
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  // And they are gone on the server, not just out of this render.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')
})

test('an edge can be taken off again, and the one a module owns cannot', async ({ page }) => {
  const { person, book } = await world(page)
  const project = await apiPost(page, '/projects', { name: 'Job hunt' })
  await apiPost(page, '/links', {
    from: { type: 'contact', id: person.id },
    to: { type: 'reading', id: book.id },
    kind: 'recommends',
  })
  await apiPost(page, '/tasks', { projectId: project.id, title: 'Rewrite the CV', parentId: null })

  await page.goto(`/contacts/${person.id}`)
  const gone = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/api\/v1\/links\?/.test(r.url()),
  )
  await page.getByRole('button', { name: 'Unlink The Design of Everyday Things' }).click()
  await gone
  await expect(page.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  // A task's project is a NOT NULL column its own module keeps. Unlinking it would mean a task
  // belonging to nothing, so the row shows and the control does not.
  await page.goto(`/projects/${project.id}`)
  await expect(page.getByRole('region', { name: 'Tasks' })).toContainText('Rewrite the CV')
  await expect(page.getByRole('button', { name: /^Unlink/ })).toHaveCount(0)
})

test('the picker offers every kind of thing, and never the object itself', async ({ page }) => {
  const { person } = await world(page)
  await apiPost(page, '/projects', { name: 'Job hunt' })
  await apiPost(page, '/meetings', {
    title: 'Second interview',
    startsLocal: '2026-10-20T21:00',
    timeZone: 'America/Toronto',
    durationMinutes: 60,
  })

  await page.goto(`/contacts/${person.id}`)
  await page.getByRole('button', { name: '+ Link' }).click()
  const list = picker(page).getByRole('listitem')
  // One box, four kinds of thing, each saying which it is -- two titles can read the same.
  await expect(list.filter({ hasText: 'Second interview' })).toContainText('Meeting')
  await expect(list.filter({ hasText: 'Job hunt' })).toContainText('Project')
  await expect(list.filter({ hasText: 'The Design of Everyday Things' })).toContainText('Reading')
  // Not themselves: a thing is not related to itself, whatever the kind.
  await expect(list.filter({ hasText: 'Ying Chen' })).toHaveCount(0)
})

/**
 * 一件活连到一个人。
 *
 * 「这个活要跟 xxx 对接」「这个活是 xxx 推荐的」—— 边早就允许了（`about` 两端都不限，`recommends`
 * 从一个人出发），缺的只是任务那一侧没有画出来。连完两头都读得到：人的那一层里也看得见这件活。
 */
test('一件活可以连到一个人，两头都读得到', async ({ page }) => {
  const { person } = await world(page)
  const project = await apiPost(page, '/projects', { name: '找工作' })
  await apiPost(page, '/tasks', { title: '准备一面', projectId: project.id })
  await page.goto(`/projects/${project.id as string}`)
  await page.getByRole('listitem').filter({ hasText: '准备一面' }).first().click()
  const pane = page.getByRole('dialog', { name: 'Task details' })
  await expect(pane).toBeVisible()
  await expect(pane.getByRole('region', { name: 'Linked' })).toContainText('Nothing linked yet')

  await pane.getByRole('button', { name: '+ Link' }).click()
  await picker(page).getByLabel('Search').fill('Ying')
  await picker(page)
    .getByRole('button', { name: /Ying Chen/ })
    .click()
  await page.getByRole('button', { name: 'about', exact: true }).click()

  await expect(pane.getByRole('region', { name: 'Linked' })).toContainText('Ying Chen')

  // 从人那一头也看得见：边是从两端读的。
  await page.goto(`/contacts/${person.id}`)
  await expect(
    page.getByRole('dialog', { name: 'Contacts' }).getByRole('region', { name: 'Linked' }),
  ).toContainText('准备一面')
})
