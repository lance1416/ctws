import { expect, test, type Page } from '@playwright/test'
import { apiPost, makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * THE TYPOGRAPHY RULES, pinned: the scale as pairs, and the Han/Latin spacing. The font stack is a
 * string in styles.css, checked in `fontStack.test.ts`.
 *
 * Every one of them is ADOPTED from a published design system, so every guard here is a guard
 * against drifting off someone else's answer, not against drifting off a taste. What makes each one
 * hard to fake:
 *
 * - `text-autospace` is checked by RENDERED GEOMETRY, not by computed style. A property can be
 *   set and ignored: the value parses in a browser that does nothing with it, and
 *   `getComputedStyle` would report it happily. Two spans of the same text at the same size, one
 *   opted out, must measure different widths or the feature is decoration.
 * - The scale is checked as PAIRS on the real elements that wear each role. Asserting the custom
 *   properties would only prove the tokens exist, not that anything uses them.
 */

/** The size/line-height pair a selector's first match computes, in px. */
const pair = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return { size: s.fontSize, line: s.lineHeight, weight: s.fontWeight }
    })

// --------------------------------------------------------------------- the scale, as rem pairs

/** The browser's own default font-size setting (Chrome: Settings > Appearance > Font size). */
async function setBrowserDefaultFontSize(page: Page, px: number) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Page.setFontSizes', { fontSizes: { standard: px } })
  await page.reload()
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(1)
}

test('the scale follows the reader root font size: size AND leading, as a pair', async ({
  page,
}) => {
  // The pairs are rem so that raising the browser's default font size raises the type. A px scale
  // -- or `calc(12px)`, or a token string that merely looks right -- computes to the same numbers
  // at the default size and cannot be told apart there; only a different root can. 125% is what a
  // reader who set their browser default to 20px gives the root. It is applied as that setting,
  // through the browser (CDP `Page.setFontSizes`), NOT by writing a `font-size` rule onto <html>: a
  // rule would override whatever the app itself put there, so an app that pinned `html { font-size:
  // 16px }` would pass. This way it is the same lever the reader pulls.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '大字号')
  await makeTask(page, pid, '一条任务', { dueAt: new Date(Date.now() - 1000).toISOString() })
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(1)

  const roles = {
    body: 'body',
    h1: 'h1',
    title: '[data-row-title]',
    // The Due column: the meta step.
    due: '[data-row-due]',
    caption: 'nav[aria-label="Projects"] [data-count]',
  } as const
  const measure = async () =>
    Object.fromEntries(
      await Promise.all(
        Object.entries(roles).map(async ([role, sel]) => {
          const m = await pair(page, sel).catch(() => null)
          return [role, m && { size: m.size, line: m.line }]
        }),
      ),
    )

  const base = await measure()
  expect(base).toEqual({
    // The body is the UI step (FR-008): rows, buttons, fields, block names.
    body: { size: '13px', line: '20px' },
    // The project's name: the title step, the head of a page.
    h1: { size: '26px', line: '34px' },
    // A tree row's title is the UI step, in a row 36 high (artboard 8).
    title: { size: '13px', line: '20px' },
    due: { size: '12px', line: '16px' },
    caption: { size: '12px', line: '16px' },
  })

  await setBrowserDefaultFontSize(page, 20)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
    '20px',
  )
  expect(await measure()).toEqual({
    body: { size: '16.25px', line: '25px' },
    h1: { size: '32.5px', line: '42.5px' },
    title: { size: '16.25px', line: '25px' },
    due: { size: '15px', line: '20px' },
    caption: { size: '15px', line: '20px' },
  })

  // And smaller, so a floor written in px (`max(16px, ...)`) cannot hide behind the larger case.
  await setBrowserDefaultFontSize(page, 12)
  expect((await measure()).title).toEqual({ size: '9.75px', line: '15px' })
})

test('Today names its day at the title step, and its rows are the UI step', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '字号')
  await makeTask(page, pid, '正在做的这一条', { status: 'in_progress' })
  await page.goto('/today')
  // Artboard 12: the date is the page's heading like any other page's, 26/34 at 600.
  expect(await pair(page, 'h1')).toEqual({ size: '26px', line: '34px', weight: '600' })
  // A row is 13/20; the one in progress in 500.
  expect(await pair(page, '[data-today-row]')).toEqual({
    size: '13px',
    line: '20px',
    weight: '500',
  })
})

/**
 * ONE PAGE-TITLE STEP. Every page's own heading is the title step (26/34, 600, FR-008); a smaller one
 * reads as a section of some other page. Today's date is one of them now (artboard 12); the
 * Workbench's hidden heading is the one that is something else on purpose.
 */
test('every page names itself at one step', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '一条线')
  // Not empty: an empty module's page is its New alone, with no heading on screen (FR-030).
  await apiPost(page, '/people', { name: '韩梅梅' })
  await apiPost(page, '/reading', { kind: 'book', title: '设计心理学' })
  await apiPost(page, '/meetings', {
    title: '周会',
    // Weekly since January 2026: always one within the overview's half year, whenever this runs.
    startsLocal: '2026-01-05T10:00',
    timeZone: 'Europe/London',
    durationMinutes: 30,
    rrule: 'FREQ=WEEKLY',
  })
  for (const path of [
    '/today',
    '/projects',
    `/projects/${pid}`,
    '/review',
    '/calendar',
    '/meetings',
    '/reading',
    '/people',
    '/people/birthdays',
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await pair(page, 'h1'), path).toEqual({ size: '26px', line: '34px', weight: '600' })
  }
})

// ------------------------------------------------------------ mixed script: text-autospace

test('text-autospace is asked for, and actually moves the glyphs', async ({ page }) => {
  await registerFreshUser(page)

  // RENDERED GEOMETRY FIRST, and the computed property only afterwards. A browser that parses `text-autospace` and does
  // nothing with it reports exactly the same computed value as one that honours it, so the only
  // honest measure is whether the text got wider. Two probes, same text, same font, same size,
  // one opted out: both inherit the app's own stack from <body>.
  const measured = await page.evaluate(() => {
    const make = (autospace: string) => {
      const el = document.createElement('span')
      el.style.cssText = `position:fixed;top:-500px;left:0;white-space:pre;font-size:16px`
      // INHERITED, not set here, for the probe that is supposed to be spaced. A probe that writes
      // `text-autospace: normal` on itself measures the BROWSER and passes even when the app never
      // opted in. Only the opt-OUT probe overrides, because the thing being proved is that the
      // app's cascade reaches ordinary text.
      if (autospace) el.style.setProperty('text-autospace', autospace)
      // No literal spaces: the ¼-em is the engine's to insert. Two Han/Latin joins and two
      // Han/digit joins, which is what CLREQ's rule is about.
      el.textContent = '任务ABC还剩123条'
      document.body.append(el)
      return el
    }
    const off = make('no-autospace')
    const on = make('')
    const spaced = make('')
    // The author already typed the space, so the engine must spend nothing: CLREQ's rule is about
    // the join that has no space, and doubling an existing one would be a defect.
    spaced.textContent = '任务 ABC'
    const spacedOff = make('no-autospace')
    spacedOff.textContent = '任务 ABC'
    const out = {
      off: off.getBoundingClientRect().width,
      on: on.getBoundingClientRect().width,
      joins: 4,
      spaced: spaced.getBoundingClientRect().width,
      spacedOff: spacedOff.getBoundingClientRect().width,
    }
    for (const el of [off, on, spaced, spacedOff]) el.remove()
    return out
  })

  // It took effect.
  expect(
    measured.on,
    `text-autospace changed nothing: ${JSON.stringify(measured)}`,
  ).toBeGreaterThan(measured.off)
  // And it took effect within CLREQ's ceiling of a quarter of a Han width per join, which at 16px
  // is 4px. An implementation that spent a full em at each join would "pass" a mere inequality.
  const perJoin = (measured.on - measured.off) / measured.joins
  expect(perJoin, `${perJoin}px per join, ceiling 4px`).toBeGreaterThan(0)
  expect(perJoin).toBeLessThanOrEqual(4)
  // Nothing is spent where a space was already typed.
  expect(measured.spaced).toBeCloseTo(measured.spacedOff, 1)

  // ...and now the property. `normal` is NOT the initial value in the browsers this ships to
  // (Chromium computes `no-autospace` unless asked), so the app has to opt in -- and it must opt
  // in on the INHERITED root, not per component, which is what the heading shows.
  await expect(page.locator('body')).toHaveCSS('text-autospace', 'normal')
  await expect(page.locator('#today-heading')).toHaveCSS('text-autospace', 'normal')
})

test('numeric columns keep tabular figures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '数字列')
  await makeTask(page, pid, '一条有截止的任务', {
    dueAt: new Date(Date.now() - 86_400_000).toISOString(),
  })
  await page.goto(`/projects/${pid}`)

  // antd's one positive numeric rule, adopted here. The tree's due column and the rail's counts
  // are the places a column of digits has to line up.
  await expect(page.locator('[data-row-due]').first()).toHaveCSS(
    'font-variant-numeric',
    'tabular-nums',
  )
  await expect(page.locator('nav[aria-label="Projects"] [data-count]').first()).toHaveCSS(
    'font-variant-numeric',
    'tabular-nums',
  )
})

/**
 * NO LETTER-SPACING ON HAN. A project's name is the user's own words and often Chinese, so the
 * page-title tracking the fixed English titles wear is not put on it.
 */
test('a project name is set without letter-spacing', async ({ page }) => {
  await registerFreshUser(page)
  const pid = await makeProject(page, '找工作')
  await page.goto(`/projects/${pid}`)
  const h1 = page.getByRole('heading', { level: 1, name: '找工作' })
  await expect(h1).toBeVisible()
  expect(await h1.evaluate((el) => getComputedStyle(el).letterSpacing)).toBe('normal')
})
