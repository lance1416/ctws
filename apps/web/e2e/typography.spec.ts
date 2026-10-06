import { expect, test, type Page } from '@playwright/test'
import { editDetail, registerFreshUser } from './helpers'

/**
 * The typography specification (docs/superpowers/specs/2026-10-06-ctws-typography.md), pinned.
 *
 * Every rule in that spec is ADOPTED from a published design system, so every guard here is a
 * guard against drifting off someone else's answer, not against drifting off a taste. What makes
 * each one hard to fake:
 *
 * - The stack is checked ENTRY BY ENTRY in order. `toContain('PingFang SC')` would pass on a
 *   stack that had lost `-apple-system`, or that had put the CJK face in front of the Latin one --
 *   which is the one ordering §1 explicitly refuses.
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

const HEADERS = { 'x-ctws-client': 'web' }

/** §1, verbatim. Everything from `-apple-system` on is Semi Design's string. */
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

/** §1, verbatim: Ant Design 5's `fontFamilyCode`. */
const FONT_MONO = ['SFMono-Regular', 'Consolas', 'Liberation Mono', 'Menlo', 'Courier', 'monospace']

/** A font-family or custom-property value as an ordered list of family names, quoting removed. */
const families = (value: string) =>
  value
    .split(',')
    .map((name) => name.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

async function makeProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/v1/projects', { headers: HEADERS, data: { name } })
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { id: string }).id
}

async function makeTask(
  page: Page,
  projectId: string,
  title: string,
  patch: Record<string, unknown> = {},
): Promise<string> {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  if (Object.keys(patch).length > 0) {
    const put = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: patch })
    expect(put.ok()).toBeTruthy()
  }
  return id
}

/** The size/line-height pair a selector's first match computes, in px. */
const pair = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return { size: s.fontSize, line: s.lineHeight, weight: s.fontWeight }
    })

// ----------------------------------------------------------------------------- §1, the font stack

test('the computed font stack is the spec string, entry for entry and in order', async ({
  page,
}) => {
  await registerFreshUser(page)

  const sans = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(families(sans)).toEqual(FONT_SANS)

  // Latin FIRST. §1 refuses Apple's CJK-first ordering, because handing Latin to Noto would throw
  // away the reason IBM Plex Sans is self-hosted at all. Asserted as its own fact, so the reason
  // survives even if somebody edits the list above.
  expect(families(sans).indexOf('IBM Plex Sans')).toBeLessThan(
    families(sans).indexOf('CTWS Noto Sans SC'),
  )
  expect(families(sans).indexOf('CTWS Noto Sans SC')).toBeLessThan(
    families(sans).indexOf('PingFang SC'),
  )

  const mono = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
  )
  expect(families(mono)).toEqual(FONT_MONO)

  // §5: no serif display step, and §1 names no serif family. The terminal `sans-serif` is the only
  // place the word may appear, so a `Songti`/`Source Han Serif` step cannot be slipped in.
  expect(families(sans).filter((name) => /serif/i.test(name))).toEqual(['sans-serif'])
})

// ------------------------------------------------------------------ §2, the scale, as px pairs

test('every role wears its own px pair from the spec table', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '字阶')
  await makeTask(page, pid, '一条有截止的任务', {
    dueAt: new Date(Date.now() - 1000).toISOString(),
  })

  // 页面标题 24/32, from TDesign headline-small (antd Heading3 agrees to the pixel).
  await page.goto('/projects')
  await expect(page.getByRole('heading', { level: 1, name: '项目' })).toBeVisible()
  expect(await pair(page, 'h1')).toEqual({ size: '24px', line: '32px', weight: '600' })

  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(1)

  // 行标题 16/24 (TDesign body-large / title-medium) and 元信息 14/22 (TDesign body-medium).
  expect(await pair(page, '[data-row-title]')).toEqual({
    size: '16px',
    line: '24px',
    weight: '400',
  })
  expect(await pair(page, '[data-row-meta]')).toEqual({
    size: '14px',
    line: '22px',
    weight: '400',
  })
  // 面板标题 20/28 (TDesign title-extraLarge; antd fontSizeXL agrees to the pixel) -- here on the
  // banner's own number, which is the project page's `Stat`.
  expect(await pair(page, '[data-stat] dd')).toEqual({
    size: '20px',
    line: '28px',
    weight: '600',
  })
  // 说明文字 12/20 (TDesign body-small).
  expect(await pair(page, '[data-stat] dt')).toEqual({
    size: '12px',
    line: '20px',
    weight: '400',
  })

  // 正文 16/24 on the body itself, and NOT a unitless leading: `line-height` must resolve to the
  // scale's own px, because two faces with different metrics meet on every line in this app.
  expect(await pair(page, 'body')).toEqual({ size: '16px', line: '24px', weight: '400' })
})

test('横幅主语 is the top step, 36/44, and the page title is one step below it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '横幅')
  await makeTask(page, pid, '正在做的这一条')
  await page.goto(`/projects/${pid}`)
  await page.getByRole('button', { name: '开始「正在做的这一条」' }).click()
  await page.goto('/')
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

// --------------------------------------------------------------- §3, 400 and 600, and no 500

test('nothing in the shipped stylesheet declares font-weight 500', async ({ page }) => {
  await page.goto('/login')
  const href = await page.evaluate(() =>
    [...document.styleSheets]
      .map((sheet) => sheet.href)
      .find((url): url is string => !!url?.includes('/assets/')),
  )
  expect(href, 'the page should load a built stylesheet from /assets').toBeTruthy()
  const css = await (await page.request.get(href!)).text()

  // 500 is a no-op on the Microsoft YaHei fallback path (measured in this project:
  // 100=200=300 | 400=500 | 600=700=800=900), so a weight step that exists only when the webfont
  // loads is not a step. TDesign's `_font.less` has zero occurrences of 500 and Semi has no 500
  // token; this app now has neither.
  // Scoped to declarations: `font-weight: 400 700` on the variable @font-face is a RANGE, not a
  // request, and must not be caught.
  expect(css.match(/font-weight:\s*500\b/g) ?? []).toEqual([])
  // And the 24 KB Plex 500 face is no longer fetched, since nothing can ask for it.
  expect(css).toContain('ibm-plex-sans-latin-400')
  expect(css).toContain('ibm-plex-sans-latin-600')
  expect(css).not.toContain('ibm-plex-sans-latin-500')
})

test('no element computes to font-weight 500, in any state that could introduce one', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '字重')
  await makeTask(page, pid, '一条正在做的任务', {
    dueAt: new Date(Date.now() - 86_400_000).toISOString(),
  })

  /** Every weight any element on the page computes, as a set. */
  const weights = (target: Page) =>
    target.evaluate(() => {
      const seen = new Set<string>()
      for (const el of document.querySelectorAll<HTMLElement>('*'))
        seen.add(getComputedStyle(el).fontWeight)
      return [...seen].sort()
    })

  // The states a DOM walk on a resting page would miss are visited on purpose: the ACTIVE rail
  // item, a row that is 正在做 (the one weight-carrying row state), a CHECKED decision chip in the
  // pane and in the 新建 dialog, and the ? overlay's group headings.
  await page.goto(`/projects/${pid}`)
  await page.getByRole('button', { name: '开始「一条正在做的任务」' }).click()
  await expect(page.locator('[data-row-title]').first()).toHaveCSS('font-weight', '600')
  expect(await weights(page), 'project page, with a running row').not.toContain('500')

  await page.locator('[data-row-title]').first().click()
  await editDetail(page)
  await page.getByRole('radio', { name: '进行中', exact: true }).check()
  expect(await weights(page), 'detail pane in editing mode, a decision checked').not.toContain(
    '500',
  )

  // Leaving by navigation rather than by Escape: the unsaved-edit guard is a different test's
  // subject, and routing through it here would make this one fail for a reason that is not weight.
  // Opened by their own controls rather than by the single-key shortcuts: whether `?` reaches the
  // document depends on where focus happens to be after a navigation, and that is keyboard.spec's
  // subject, not this one's.
  await page.goto('/')
  await page.getByRole('button', { name: '键盘快捷键' }).click()
  await expect(page.getByRole('dialog', { name: '键盘快捷键' })).toBeVisible()
  expect(await weights(page), 'the ? overlay').not.toContain('500')
  await page.keyboard.press('Escape')

  // 新建… belongs to a project page, which is also where its parent-and-project fields mean
  // something.
  await page.goto(`/projects/${pid}`)
  await expect(page.locator('[data-task-tree] li[data-depth]')).toHaveCount(1)
  await page.getByRole('button', { name: '新建…', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新建任务' })).toBeVisible()
  await page.getByRole('radio', { name: '进行中', exact: true }).check()
  const inDialog = await weights(page)
  expect(inDialog, 'the 新建 dialog, a decision checked').not.toContain('500')
  // ...and the only two weights the whole app spends are the two the spec allows. 700+ is out as
  // well: indistinguishable from 600 under Microsoft YaHei, too heavy for a dense UI under Noto.
  expect(
    inDialog.filter((w) => w !== '400' && w !== '600'),
    `weights found: ${inDialog}`,
  ).toEqual([])
})

// --------------------------------------------------------- §4, mixed script: text-autospace

test('text-autospace is asked for, and actually moves the glyphs', async ({ page }) => {
  await registerFreshUser(page)

  // `normal` is NOT the initial value in the browsers this ships to (Chromium computes
  // `no-autospace` unless asked), so the app has to opt in -- and it must opt in on the INHERITED
  // root, not per component.
  await expect(page.locator('body')).toHaveCSS('text-autospace', 'normal')
  const heading = page.getByRole('heading', { level: 1, name: '今天' })
  await expect(heading).toHaveCSS('text-autospace', 'normal')

  // RENDERED GEOMETRY, not the computed property. A browser that parses `text-autospace` and does
  // nothing with it reports exactly the same computed value as one that honours it, so the only
  // honest measure is whether the text got wider. Two probes, same text, same font, same size,
  // one opted out: both inherit the app's own stack from <body>.
  const measured = await page.evaluate(() => {
    const make = (autospace: string) => {
      const el = document.createElement('span')
      el.style.cssText = `position:fixed;top:-500px;left:0;white-space:pre;font-size:16px;text-autospace:${autospace}`
      // No literal spaces: the ¼-em is the engine's to insert. Two Han/Latin joins and two
      // Han/digit joins, which is what CLREQ's rule is about.
      el.textContent = '任务ABC还剩123条'
      document.body.append(el)
      return el
    }
    const off = make('no-autospace')
    const on = make('normal')
    const spaced = document.createElement('span')
    spaced.style.cssText =
      'position:fixed;top:-500px;left:0;white-space:pre;font-size:16px;text-autospace:normal'
    // The author already typed the space, so the engine must spend nothing: CLREQ's rule is about
    // the join that has no space, and doubling an existing one would be a defect.
    spaced.textContent = '任务 ABC'
    document.body.append(spaced)
    const spacedOff = document.createElement('span')
    spacedOff.style.cssText =
      'position:fixed;top:-500px;left:0;white-space:pre;font-size:16px;text-autospace:no-autospace'
    spacedOff.textContent = '任务 ABC'
    document.body.append(spacedOff)
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
  // And it took effect within CLREQ's ceiling: 「不多于四分之一个汉字宽」 per join, which at 16px
  // is 4px. An implementation that spent a full em at each join would "pass" a mere inequality.
  const perJoin = (measured.on - measured.off) / measured.joins
  expect(perJoin, `${perJoin}px per join, ceiling 4px`).toBeGreaterThan(0)
  expect(perJoin).toBeLessThanOrEqual(4)
  // Nothing is spent where a space was already typed.
  expect(measured.spaced).toBeCloseTo(measured.spacedOff, 1)
})

test('no size-adjust, no font-size-adjust, and Han is never tracked', async ({ page }) => {
  await page.goto('/login')
  const href = await page.evaluate(() =>
    [...document.styleSheets]
      .map((sheet) => sheet.href)
      .find((url): url is string => !!url?.includes('/assets/')),
  )
  const css = await (await page.request.get(href!)).text()

  // §4: five surveyed token files use neither, and `size-adjust`'s documented purpose is
  // fallback-metric matching for CLS, not script pairing. The metric-compensation programme this
  // replaced would have landed exactly here.
  // `(?<![-\w])` and not `\b`: Tailwind's preflight sets `-webkit-text-size-adjust`, which is a
  // different property about mobile text inflation, and a `\b` here matches inside it.
  expect(css.match(/(?<![-\w])size-adjust\s*:/g) ?? []).toEqual([])
  expect(css.match(/(?<![-\w])font-size-adjust\s*:/g) ?? []).toEqual([])

  // "Never letter-space Han" -- unanimous across all five token files, and this app's rule since
  // before the survey. Anything but `normal` on a surface that carries Chinese is the defect.
  await registerFreshUser(page)
  for (const selector of ['body', 'h1', '[data-panel] h2']) {
    await expect(page.locator(selector).first()).toHaveCSS('letter-spacing', 'normal')
  }
})

test('numeric columns keep tabular figures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await registerFreshUser(page)
  const pid = await makeProject(page, '数字列')
  await makeTask(page, pid, '一条有截止的任务', {
    dueAt: new Date(Date.now() - 86_400_000).toISOString(),
  })
  await page.goto(`/projects/${pid}`)

  // antd's one positive numeric rule, adopted in §4. The row's date column and the banner's
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
