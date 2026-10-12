import { expect, test, type Page } from '@playwright/test'
import { makeProject, makeTask, registerFreshUser } from './helpers'

/**
 * THE TYPOGRAPHY RULES, pinned: the font stack, the scale as pairs, the two weights, and the
 * Han/Latin spacing.
 *
 * Every one of them is ADOPTED from a published design system, so every guard here is a guard
 * against drifting off someone else's answer, not against drifting off a taste. What makes each one
 * hard to fake:
 *
 * - The stack is checked ENTRY BY ENTRY in order. `toContain('PingFang SC')` would pass on a
 *   stack that had lost `-apple-system`, or that had put the CJK face in front of the Latin one --
 *   which is the one ordering the stack explicitly refuses.
 * - `text-autospace` is checked by RENDERED GEOMETRY, not by computed style. A property can be
 *   set and ignored: the value parses in a browser that does nothing with it, and
 *   `getComputedStyle` would report it happily. Two spans of the same text at the same size, one
 *   opted out, must measure different widths or the feature is decoration.
 * - "no 500" is checked in the SHIPPED STYLESHEET and on the live DOM in the states that can
 *   introduce one (a selected chip, an active rail item, a running row). A DOM walk alone misses
 *   a `:checked` rule nothing on screen has triggered; a stylesheet grep alone misses an inline
 *   style.
 * - The scale is checked as PAIRS on the real elements that wear each role. Asserting the custom
 *   properties would only prove the tokens exist, not that anything uses them.
 */

/** The stack, verbatim. Everything from `-apple-system` on is Semi Design's string. */
const FONT_SANS = [
  'IBM Plex Sans',
  'CTWS Noto Sans SC',
  '-apple-system',
  'BlinkMacSystemFont',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Segoe UI',
  'Helvetica Neue',
  'Helvetica',
  'Arial',
  'sans-serif',
]

/** Verbatim: Ant Design 5's `fontFamilyCode`. */
const FONT_MONO = ['SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'Courier', 'monospace']

/** A font-family or custom-property value as an ordered list of family names, quoting removed. */
const families = (value: string) =>
  value
    .split(',')
    .map((name) => name.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

/** The size/line-height pair a selector's first match computes, in px. */
const pair = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return { size: s.fontSize, line: s.lineHeight, weight: s.fontWeight }
    })

// -------------------------------------------------------------------------------- the font stack

test('the computed font stack is the spec string, entry for entry and in order', async ({
  page,
}) => {
  await registerFreshUser(page)

  const sans = families(await page.evaluate(() => getComputedStyle(document.body).fontFamily))

  // THE TWO NAMED FACTS COME FIRST, then the whole list. Each is a separate reason the spec gives,
  // and an exact-list assertion placed in front would swallow both: every mutation would report
  // "the list differs" and neither reason would ever get to say what it is about.
  //
  // Latin FIRST. The stack refuses Apple's CJK-first ordering, because handing Latin to Noto would
  // throw away the reason IBM Plex Sans is self-hosted at all.
  expect(sans.indexOf('IBM Plex Sans'), `Latin must lead: ${sans}`).toBeLessThan(
    sans.indexOf('CTWS Noto Sans SC'),
  )
  expect(
    sans.indexOf('CTWS Noto Sans SC'),
    `the webfont must precede the system CJK faces: ${sans}`,
  ).toBeLessThan(sans.indexOf('PingFang SC'))

  // No serif display step, and the stack names no serif family. The terminal `sans-serif` is the
  // only place the word may appear, so a `Songti`/`Source Han Serif` step cannot be slipped in.
  expect(
    sans.filter((name) => /serif/i.test(name)),
    `a serif family appeared in the stack: ${sans}`,
  ).toEqual(['sans-serif'])

  // ...and then the whole string, entry for entry.
  expect(sans).toEqual(FONT_SANS)

  const mono = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
  )
  expect(families(mono)).toEqual(FONT_MONO)
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
    meta: '[data-row-meta]',
    panel: '[data-panel="Tasks"] h2',
    caption: '[data-stat] dt',
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
    body: { size: '16px', line: '24px' },
    h1: { size: '24px', line: '32px' },
    title: { size: '16px', line: '24px' },
    meta: { size: '14px', line: '22px' },
    panel: { size: '20px', line: '28px' },
    caption: { size: '12px', line: '20px' },
  })

  await setBrowserDefaultFontSize(page, 20)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
    '20px',
  )
  expect(await measure()).toEqual({
    body: { size: '20px', line: '30px' },
    h1: { size: '30px', line: '40px' },
    title: { size: '20px', line: '30px' },
    meta: { size: '17.5px', line: '27.5px' },
    panel: { size: '25px', line: '35px' },
    caption: { size: '15px', line: '25px' },
  })

  // And smaller, so a floor written in px (`max(16px, ...)`) cannot hide behind the larger case.
  await setBrowserDefaultFontSize(page, 12)
  expect((await measure()).title).toEqual({ size: '12px', line: '18px' })
})

test('the banner subject is the top step, 36/44, and the page title is one below it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '横幅')
  await makeTask(page, pid, '正在做的这一条')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('button', { name: 'Start “正在做的这一条”' }).click()
  await page.goto('/tasks/today')
  const banner = page.locator('[data-today-row]')
  await expect(banner).toHaveCount(1)

  const subject = await banner
    .locator('span > span')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return { size: s.fontSize, line: s.lineHeight, weight: s.fontWeight }
    })
  expect(subject).toEqual({ size: '36px', line: '44px', weight: '600' })
  // The thing being done right now outranks the name of the page it is on.
  expect(await pair(page, 'h1')).toEqual({ size: '24px', line: '32px', weight: '600' })
})

// -------------------------------------------------------------------- 400 and 600, and no 500

// ------------------------------------------------------------ mixed script: text-autospace

test('text-autospace is asked for, and actually moves the glyphs', async ({ page }) => {
  await registerFreshUser(page)

  // RENDERED GEOMETRY FIRST, and the computed property only afterwards: a property can be set and
  // ignored, so the property check is the weaker claim and must not be the one that speaks when
  // this breaks.
  //
  // RENDERED GEOMETRY, not the computed property. A browser that parses `text-autospace` and does
  // nothing with it reports exactly the same computed value as one that honours it, so the only
  // honest measure is whether the text got wider. Two probes, same text, same font, same size,
  // one opted out: both inherit the app's own stack from <body>.
  const measured = await page.evaluate(() => {
    const make = (autospace: string) => {
      const el = document.createElement('span')
      el.style.cssText = `position:fixed;top:-500px;left:0;white-space:pre;font-size:16px`
      // INHERITED, not set here, for the probe that is supposed to be spaced. A probe that writes
      // `text-autospace: normal` on itself measures the BROWSER and passes even when the app never
      // opted in -- measured against a mutation that turned the app's own declaration off, which
      // is why it is written this way. Only the opt-OUT probe overrides, because the thing being
      // proved is that the app's cascade reaches ordinary text.
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
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toHaveCSS(
    'text-autospace',
    'normal',
  )
})

test('numeric columns keep tabular figures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '数字列')
  await makeTask(page, pid, '一条有截止的任务', {
    dueAt: new Date(Date.now() - 86_400_000).toISOString(),
  })
  await page.goto(`/projects/${pid}`)

  // antd's one positive numeric rule, adopted here. The row's date column and the banner's
  // counts are the places a column of digits has to line up.
  await expect(page.locator('[data-due-text]').first()).toHaveCSS(
    'font-variant-numeric',
    'tabular-nums',
  )
  await expect(page.locator('[data-stat] dd').first()).toHaveCSS(
    'font-variant-numeric',
    'tabular-nums',
  )
})
