import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, seedTasks, startProject, WEB, apiPost, openCapture } from './helpers'

/** The row's focus carrier in the tree; its accessible name is the task title. */
const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `Task: ${title}`, exact: true })

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title })

const searchBox = (page: Page) => page.getByRole('combobox', { name: 'Search' })

/** Types into the search box and waits for the server's answer, so no assertion races the fetch. */
async function query(page: Page, text: string) {
  const answered = page.waitForResponse((r) => r.url().includes('/api/v1/tasks?q=') && r.ok(), {
    timeout: 15_000,
  })
  await searchBox(page).fill(text)
  await answered
}

/**
 * A result row, BY ITS ROLE: `role="option"` inside a `role="listbox"` (ARIA 1.2 combobox), so a
 * screen reader is told which one the keyboard has selected.
 */
const result = (page: Page, title: string) =>
  page.getByRole('dialog', { name: 'Search' }).getByRole('option').filter({ hasText: title })

// The case the browser's own Ctrl+F cannot do: a collapsed row is not in the DOM at all, so there
// is nothing on the page for the browser to find. If this test ever passes with the subtree left
// expanded it proves nothing, so the collapse is asserted (the child row is GONE) before searching.
test('search finds a task inside a collapsed subtree and leaves it visible and focused', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Deep')
  await seedTasks(page, url, [
    ['外层', null],
    ['中层', '外层'],
    ['藏起来的针', '中层'],
  ])
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveCount(3)

  // Fold the top of the chain: both descendants leave the DOM.
  await row(page, '外层').getByRole('button', { name: 'Collapse' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
  await expect(handle(page, '藏起来的针')).toHaveCount(0)
  // And the browser could not find it either: the text is not on the page.
  expect(await page.locator('body').innerText()).not.toContain('藏起来的针')

  // Leave the project entirely, so nothing about this is "already on the right page".
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.locator('#today-heading')).toBeVisible()

  await page.keyboard.press('Control+k')
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
  await expect(row(page, '外层').getByRole('button', { name: 'Expand' })).toHaveCount(0)
  await expect(row(page, '中层').getByRole('button', { name: 'Expand' })).toHaveCount(0)

  // The reveal is consumed: the url is clean, so folding it again is not undone on the next render.
  await expect(page).not.toHaveURL(/reveal=/)
  await row(page, '外层').getByRole('button', { name: 'Collapse' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(1)
})

test('search reaches a task in a project other than the one being viewed', async ({ page }) => {
  await registerFreshUser(page)
  const alpha = await startProject(page, 'Alpha')
  await seedTasks(page, alpha, [['alpha 的活', null]])
  const beta = await startProject(page, 'Beta')
  await seedTasks(page, beta, [['beta 的活', null]])

  // Standing on Beta, looking for something in Alpha.
  await page.goto(beta)
  await expect(page.getByRole('listitem')).toHaveCount(1)

  await page.keyboard.press('Control+k')
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
  const ids = await seedTasks(page, url, [
    ['迁移计划', null],
    ['hint 的子任务', '迁移计划'],
    ['hint 已完成', null],
    ['hint 删掉的', null],
  ])
  const done = await page.request.patch(`/api/v1/tasks/${ids.get('hint 已完成')!}`, {
    headers: WEB,
    data: { status: 'done' },
  })
  expect(done.status()).toBe(200)
  const removed = await page.request.delete(`/api/v1/tasks/${ids.get('hint 删掉的')!}`, {
    headers: WEB,
  })
  expect(removed.status()).toBe(204)

  await page.keyboard.press('Control+k')
  await query(page, 'hint')

  // `project › parent`, exactly as the Today and Done lists write it.
  await expect(result(page, 'hint 的子任务')).toContainText('Ctx › 迁移计划')
  // A finished task is findable on purpose -- and says so, so it is not mistaken for live work.
  await expect(result(page, 'hint 已完成')).toContainText('Done')
  // Deleted is the one thing search does not return.
  await expect(result(page, 'hint 删掉的')).toHaveCount(0)
})

/**
 * WHAT A SCREEN READER HEARS: a highlight that assistive technology cannot report is no selection
 * at all -- no list, no item count, no "2 of 3", and no title read out.
 *
 * This asserts the RELATIONSHIP and not the highlight class: that the box is a combobox pointing at
 * a listbox, that `aria-activedescendant` names a real element, that the element it names is the
 * `option` the keyboard selected, and that moving the selection moves the pointer with it. A class
 * swap would satisfy none of these.
 */
test('the search selection is announceable: combobox, listbox, activedescendant', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Aria')
  await seedTasks(page, url, [
    ['查找甲', null],
    ['查找乙', null],
    ['查找丙', null],
  ])
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveCount(3)
  await page.keyboard.press('Control+k')

  const box = searchBox(page)
  await expect(box).toHaveRole('combobox')
  // Before anything is typed the list holds the places, and the box says so: it is expanded and
  // points at the first one, rather than claiming an empty list while showing a full one.
  await expect(box).toHaveAttribute('aria-expanded', 'true')
  expect(await box.getAttribute('aria-activedescendant')).toBeTruthy()
  const listId = await box.getAttribute('aria-controls')
  expect(listId).toBeTruthy()

  await query(page, '查找')
  await expect(box).toHaveAttribute('aria-expanded', 'true')
  // `aria-controls` resolves to a real listbox -- the one holding the options.
  const list = page.locator(`#${listId!}`)
  await expect(list).toHaveRole('listbox')
  await expect(list.getByRole('option')).toHaveCount(3)

  /** The option `aria-activedescendant` currently names, and what it says. */
  const pointed = async () => {
    const id = await box.getAttribute('aria-activedescendant')
    expect(id, 'aria-activedescendant names nothing').toBeTruthy()
    const el = page.locator(`#${id!}`)
    await expect(el, 'aria-activedescendant names an element that is not in the list').toHaveCount(
      1,
    )
    await expect(el).toHaveRole('option')
    await expect(el).toHaveAttribute('aria-selected', 'true')
    return (await el.innerText()).split('\n')[0]!
  }

  // It starts on the first result, and `aria-selected` is on that one option alone.
  const first = await pointed()
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(1)

  // ArrowDown moves the POINTER, not the focus: the box still has the keyboard, which is what lets
  // typing continue while the highlight walks.
  await page.keyboard.press('ArrowDown')
  const second = await pointed()
  expect(second).not.toBe(first)
  await expect(box).toBeFocused()

  // And the non-standard pair moves it the same way, so the two routes cannot drift apart.
  await page.keyboard.press('Control+p')
  expect(await pointed()).toBe(first)
  await page.keyboard.press('Control+n')
  expect(await pointed()).toBe(second)

  // A held modifier does not change what an arrow does here: Shift+arrow walks the list too.
  await page.keyboard.press('Shift+ArrowUp')
  expect(await pointed()).toBe(first)
  await page.keyboard.press('Shift+ArrowDown')
  expect(await pointed()).toBe(second)

  // Enter opens the option the pointer names -- the selection a reader was told about is the one
  // that acts.
  await page.keyboard.press('Enter')
  await expect(handle(page, second)).toBeFocused()
})

test('Escape closes search, and Ctrl K opens it even from a text field', async ({ page }) => {
  await registerFreshUser(page)

  await page.keyboard.press('Control+k')
  await expect(searchBox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(searchBox(page)).toHaveCount(0)

  // Opened from the top bar's box instead: closing returns focus to it rather than dropping to
  // <body> (WCAG 2.4.3), which is the behaviour the rest of this app already holds to.
  await page.getByRole('button', { name: /^Search everything/ }).click()
  await expect(searchBox(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /^Search everything/ })).toBeFocused()

  // In the capture box a letter is a letter; Ctrl K is a command, and works from there too.
  const box = await openCapture(page)
  await box.press('f')
  await expect(searchBox(page)).toHaveCount(0)
  await expect(box).toHaveValue('f')
  await box.press('Control+k')
  await expect(searchBox(page)).toBeFocused()
})

/**
 * THE PROMISE `aria-modal` MAKES, kept: assistive technology is told the rest of the page is
 * unreachable, so the keyboard must not walk out of the panel onto a row nobody can see.
 *
 * Forty presses, not one: a trap that holds for a few and then gives way is the failure shape, and
 * the count is more than twice the panel's own tabbable controls either way round.
 */
test('no Tab reaches outside the search dialog while it is open', async ({ page }) => {
  await registerFreshUser(page)
  const url = await startProject(page, 'Trap')
  await seedTasks(page, url, [
    ['第一条', null],
    ['第二条', null],
  ])
  await page.goto(url)
  await expect(page.getByRole('listitem')).toHaveCount(2)

  // Opened from a real control, so "where focus goes back to" has an answer worth asserting.
  await handle(page, '第一条').focus()
  await page.keyboard.press('Control+k')
  await expect(searchBox(page)).toBeFocused()
  await query(page, '条')
  await expect(page.locator('[data-search-result]')).toHaveCount(2)

  const inside = () =>
    page.evaluate(() => {
      const el = document.activeElement
      return !!el && el !== document.body && !!el.closest('[role="dialog"]')
    })
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press(key)
      expect(await inside(), `${key} press ${i + 1} left the dialog`).toBe(true)
    }
  }

  // The trap is not a lock: Escape still closes it, and focus goes back to the row it was opened
  // from rather than to <body> (WCAG 2.4.3).
  await page.keyboard.press('Escape')
  await expect(searchBox(page)).toHaveCount(0)
  await expect(handle(page, '第一条')).toBeFocused()
})

// ------------------------------------------------------------------------- places and recents
/**
 * With no row per kind in the rail, search is also how you get to a place: before anything is
 * typed it lists what was opened lately and every place, and typing narrows places too.
 */
test('search goes to places: before typing, and by name', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Search' })
  // Nothing typed yet: the places are all there, each with the key that goes straight to it.
  await expect(dialog.getByRole('option', { name: /^Organisations/ })).toBeVisible()
  await expect(dialog.getByRole('option', { name: /^People/ })).toContainText('G E')

  await searchBox(page).fill('organ')
  await expect(dialog.getByRole('option').first()).toContainText('Organisations')
  await searchBox(page).press('Enter')
  await expect(page).toHaveURL(/\/organisations$/)
})

test('what was opened lately is first, before anything is typed', async ({ page }) => {
  await registerFreshUser(page, '/')
  const made = await apiPost(page, '/people', { name: '陈颖' })
  const { id } = made
  await page.goto(`/people/${id}`)
  await expect(page.getByRole('dialog').getByRole('heading', { name: '陈颖' })).toBeVisible()

  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  const first = page.getByRole('dialog', { name: 'Search' }).getByRole('option').first()
  await expect(first).toContainText('陈颖')
  await expect(first).toContainText('Person')
  await searchBox(page).press('Enter')
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
})

test('choosing a person in search opens that person', async ({ page }) => {
  await registerFreshUser(page, '/')
  const made = await apiPost(page, '/people', { name: 'Dana Search' })
  const { id } = made
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  await query(page, 'Dana')
  await result(page, 'Dana Search').click()
  await expect(page).toHaveURL(new RegExp(`/people/${id}$`))
  await expect(page.getByRole('dialog', { name: 'People' })).toBeVisible()
})

test('choosing a reading item in search opens that item', async ({ page }) => {
  await registerFreshUser(page, '/')
  const made = await apiPost(page, '/reading', { kind: 'book', title: 'Searchable book' })
  const { id } = made
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  await query(page, 'Searchable')
  await result(page, 'Searchable book').click()
  await expect(page).toHaveURL(new RegExp(`/reading/${id}$`))
  await expect(page.getByRole('dialog', { name: 'Reading' })).toBeVisible()
})

test('Enter straight after typing goes where the typing points', async ({ page }) => {
  // Before anything was typed the list held other places; Enter must not choose from that list
  // because the typing has not been read yet.
  await registerFreshUser(page, '/')
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  await searchBox(page).pressSequentially('peo')
  await searchBox(page).press('Enter')
  await expect(page).toHaveURL(/\/people$/)
})

test('the groups before typing are named for a screen reader', async ({ page }) => {
  await registerFreshUser(page, '/')
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  const goTo = page.getByRole('dialog', { name: 'Search' }).getByRole('group', { name: 'Go to' })
  await expect(goTo.getByRole('option', { name: /^Workbench/ })).toBeVisible()
})

test('a person deleted here leaves Recent at once', async ({ page }) => {
  await registerFreshUser(page, '/')
  const made = await apiPost(page, '/people', { name: '陈颖' })
  const { id } = made
  await page.goto(`/people/${id}`)
  const pane = page.getByRole('dialog', { name: 'People' })
  await expect(pane.getByRole('heading', { name: '陈颖' })).toBeVisible()
  await pane.getByRole('button', { name: /^Delete / }).click()
  await page
    .getByRole('alertdialog', { name: 'Delete 陈颖' })
    .getByRole('button', { name: /^Delete/ })
    .click()
  await expect(pane).toHaveCount(0)

  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option', { name: /^Workbench/ })).toBeVisible()
  await expect(dialog.getByRole('option', { name: /陈颖/ })).toHaveCount(0)
})

test('a project deleted elsewhere leaves Recent once its page finds it gone', async ({ page }) => {
  await registerFreshUser(page, '/')
  const made = await apiPost(page, '/projects', { name: 'Job hunt' })
  const { id } = made
  await page.goto(`/projects/${id}`)
  const here = page.getByRole('banner').locator('[aria-current="page"]')
  await expect(here).toHaveText('Job hunt')

  const gone = await page.request.delete(`/api/v1/projects/${id}`, { headers: WEB })
  expect(gone.ok(), await gone.text()).toBe(true)
  await page.goto(`/projects/${id}`)
  await expect(page.getByText('This project is not here any more.')).toBeVisible()
  // The header still says where this is, rather than an empty name.
  await expect(here).toHaveText('Not found')

  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option', { name: /^Workbench/ })).toBeVisible()
  await expect(dialog.getByRole('option', { name: /Job hunt/ })).toHaveCount(0)
})

test('results landing do not pull the highlight back to the first row', async ({ page }) => {
  await registerFreshUser(page, '/')
  await apiPost(page, '/reading', { kind: 'book', title: 'Peopleware' })
  // The module hits arrive late, after the places have been walked.
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(/\/api\/v1\/.*[?&]q=/, async (r) => {
    await held
    await r.continue()
  })
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^Search everything/ })
    .click()
  const box = searchBox(page)
  await box.pressSequentially('e')
  const dialog = page.getByRole('dialog', { name: 'Search' })
  await expect(dialog.getByRole('option').nth(1)).toBeVisible()
  await box.press('ArrowDown')
  const second = await box.getAttribute('aria-activedescendant')
  expect(second).toMatch(/-option-1$/)

  const landed = page.waitForResponse((r) => r.url().includes('/api/v1/reading?q='))
  release()
  await landed
  await expect(result(page, 'Peopleware')).toBeVisible()
  await expect(box).toHaveAttribute('aria-activedescendant', second!)
})
