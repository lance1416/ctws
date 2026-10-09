import { expect, test, type Page } from '@playwright/test'
import { editDetail, makeProject, openProject, registerFreshUser } from './helpers'

/**
 * MARKDOWN NOTES (D73): what renders, what is refused, and what is NOT downloaded.
 *
 * These run against the real container, which is the only place two of the three claims can even be
 * made. The bundle split is a claim about REQUESTS -- `mermaid` and `katex` are fetched for a note
 * that uses them and not for one that does not -- and a request only has a content-hashed chunk name
 * to be recognised by once Vite has built it. The sanitiser is a claim about what a real browser's
 * parser does with the markup, which a string comparison in node cannot settle (the unit tests in
 * `src/notes/markdown.test.tsx` settle the schema; these settle the page).
 */

const HEADERS = { 'x-ctws-client': 'web' }

async function makeNoted(page: Page, projectId: string, title: string, notes: string) {
  const res = await page.request.post('/api/v1/tasks', {
    headers: HEADERS,
    data: { projectId, title, parentId: null },
  })
  expect(res.ok()).toBeTruthy()
  const id = ((await res.json()) as { id: string }).id
  const p = await page.request.patch(`/api/v1/tasks/${id}`, { headers: HEADERS, data: { notes } })
  expect(p.ok()).toBeTruthy()
  return id
}

/** Registers, makes a project with one noted task, and opens that task's detail in READING mode. */
async function seedNote(page: Page, notes: string, title = '读一下') {
  await registerFreshUser(page)
  const pid = await makeProject(page, 'P')
  await makeNoted(page, pid, title, notes)
  await page.goto(`/projects/${pid}`)
  await page.getByRole('listitem').filter({ hasText: title }).first().click()
  await expect(page.getByRole('dialog', { name: 'Task details' })).toBeVisible()
  return pid
}

const notesBlock = (page: Page) => page.locator('[data-detail-notes]')

// ------------------------------------------------------------------------------ what renders

test('a note renders GFM: a table, a task list and strikethrough', async ({ page }) => {
  await seedNote(
    page,
    [
      '| 项 | 值 |',
      '| --- | --- |',
      '| 预算 | 3 |',
      '',
      '- [x] 做完了',
      '- [ ] 还没有',
      '',
      '~~作废~~',
    ].join('\n'),
  )
  const notes = notesBlock(page)
  await expect(notes.locator('table')).toBeVisible()
  await expect(notes.locator('th', { hasText: '项' })).toBeVisible()
  await expect(notes.locator('del')).toHaveText('作废')
  // The task-list mark is an image with a name, not a disabled checkbox: reading mode stays free of
  // controls whatever a note contains (see `pane.spec.ts`), and that invariant must not become
  // conditional on the note's text.
  await expect(notes.getByRole('img', { name: 'Checked' })).toBeVisible()
  await expect(notes.getByRole('img', { name: 'Empty' })).toBeVisible()
  await expect(notes.locator('input')).toHaveCount(0)
})

test('inline code and a code fence are set in the mono stack, with ligatures off', async ({
  page,
}) => {
  await seedNote(page, '跑 `a != b` 看看\n\n```sh\necho $HOME\n```')
  const mono = await notesBlock(page)
    .locator('pre code')
    .evaluate((el) => {
      const s = getComputedStyle(el)
      return { family: s.fontFamily, ligatures: s.fontVariantLigatures }
    })
  // The typography spec's `--font-mono` token is Ant Design 5's `fontFamilyCode` verbatim; its head
  // entry is what a built stylesheet must still name.
  expect(mono.family).toContain('SFMono-Regular')
  // A coding ligature redraws `!=` as a single glyph, and a note quotes shell commands.
  expect(mono.ligatures).toBe('none')
})

test('a note renders maths through KaTeX', async ({ page }) => {
  await seedNote(page, '圆的面积是 $\\pi r^2$ ，推导：\n\n$$\nA = \\int_0^r 2\\pi t\\,dt\n$$')
  // `.katex` only exists once KaTeX has arrived and run: the assertion is on typeset output, not on
  // the source having been recognised.
  await expect(notesBlock(page).locator('.katex').first()).toBeVisible()
  await expect(notesBlock(page).locator('.katex-display')).toBeVisible()
  /**
   * AND THE VISIBLE MATHS IS NOT THE CHARACTERS THE AUTHOR TYPED. Asserted on `.katex-html`, the
   * part KaTeX DRAWS, and not on the block's whole text: KaTeX also emits MathML with an
   * `<annotation>` carrying the original TeX, which is what a screen reader and a copy get. The
   * first version of this assertion read the whole subtree, found the TeX in that annotation and
   * failed -- correctly, because the claim it was making was the wrong one.
   */
  const drawn = await notesBlock(page).locator('.katex-html').first().innerText()
  expect(drawn).not.toContain('\\')
  expect(drawn).toContain('\u03c0')
  // The accessible copy of the source is there, which is the half not to 'fix' by deleting it.
  await expect(notesBlock(page).locator('.katex annotation').first()).toContainText('\\pi r^2')
})

test('a mermaid fence renders a diagram', async ({ page }) => {
  await seedNote(
    page,
    '流程：\n\n```mermaid\ngraph TD;\n  收到需求 --> 排期;\n  排期 --> 开工;\n```',
  )
  const diagram = notesBlock(page).locator('[data-note-diagram="ready"]')
  await expect(diagram).toBeVisible()
  await expect(diagram.locator('svg')).toBeVisible()
  // A diagram, not a picture of a fence: the node labels are in the svg's own text.
  await expect(diagram.locator('svg')).toContainText('排期')
  // It cannot widen the pane it is in.
  const overflow = await diagram.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

// -------------------------------------------------------------- what is refused (the Markdown path)

/**
 * Every injection in one note, and then the page is asked what it became. Collected as a list so a
 * failure names the one that got through rather than only the first.
 */
const INJECTIONS = [
  '<script>window.__xss = "script"</script>',
  '<img src=x onerror="window.__xss = \'onerror\'">',
  "[点我](javascript:window.__xss='href')",
  '<iframe src="https://example.invalid/"></iframe>',
  '<div onclick="window.__xss=\'raw\'">一段原始 HTML</div>',
  '<style>body{display:none}</style>',
]

test('a note cannot smuggle a script, a handler, a javascript: link or an iframe', async ({
  page,
}) => {
  const alerts: string[] = []
  page.on('dialog', (d) => {
    alerts.push(d.message())
    void d.dismiss()
  })
  await seedNote(page, INJECTIONS.join('\n\n'))
  const notes = notesBlock(page)
  await expect(notes).toBeVisible()

  // Nothing executed, and nothing that could execute is in the tree.
  expect(await page.evaluate(() => (window as unknown as { __xss?: string }).__xss)).toBeUndefined()
  expect(alerts).toEqual([])
  await expect(notes.locator('script')).toHaveCount(0)
  await expect(notes.locator('iframe')).toHaveCount(0)
  await expect(notes.locator('img')).toHaveCount(0)
  await expect(notes.locator('style')).toHaveCount(0)
  await expect(notes.locator('[onclick], [onerror], [onload]')).toHaveCount(0)
  await expect(notes.locator('a[href^="javascript:"]')).toHaveCount(0)

  // The one rule that is about the PAGE and not the subtree: a `<style>` in a note that survived
  // would style everything, so the body must still be visible.
  await expect(page.locator('body')).toBeVisible()
  // The note is still readable -- sanitising is not blanking.
  await expect(notes).toContainText('一段原始 HTML')

  // Measured on the DOM rather than on a screenshot: no attribute anywhere under the note begins
  // with `on`, whatever its spelling.
  const handlers = await notes.evaluate((root) =>
    [...root.querySelectorAll('*')]
      .flatMap((el) => [...el.attributes].map((a) => a.name))
      .filter((name) => name.toLowerCase().startsWith('on')),
  )
  expect(handlers).toEqual([])
})

// ----------------------------------------------------------------- what is refused (the mermaid path)

test('a mermaid diagram cannot break out of its own svg or its own stylesheet', async ({
  page,
}) => {
  const alerts: string[] = []
  const stray: string[] = []
  page.on('dialog', (d) => {
    alerts.push(d.message())
    void d.dismiss()
  })
  // Any request a diagram's CSS could cause. 127.0.0.1:9 is the discard port: a fetch to it is
  // visible here and harmless everywhere.
  page.on('request', (r) => {
    if (r.url().includes('127.0.0.1:9')) stray.push(r.url())
  })

  const diagrams = [
    // A label that tries to close the stylesheet mermaid wrote and start an element of its own --
    // the mutation-XSS shape: text that re-parses as markup.
    '```mermaid\ngraph TD;\n  A["</style><img src=x onerror=\'window.__xss=1\'>"] --> B[ok];\n```',
    // A click directive, which is how a diagram asks for a navigable target.
    '```mermaid\ngraph TD;\n  C[c] --> D[d];\n  click C "javascript:window.__xss=2"\n```',
    // An init directive turning HTML labels back on, which is how a label becomes a foreignObject
    // full of markup.
    '```mermaid\n%%{init: {"flowchart": {"htmlLabels": true}}}%%\ngraph TD;\n  E["<img src=x onerror=\'window.__xss=3\'>"] --> F[f];\n```',
    // CSS with a network fetch in it, reached through a classDef rather than through a style tag.
    '```mermaid\ngraph TD;\n  G[g];\n  classDef bad fill:url(http://127.0.0.1:9/p.png);\n  class G bad;\n```',
  ]
  await seedNote(page, diagrams.join('\n\n'))
  const notes = notesBlock(page)
  /**
   * EVERY FENCE SETTLED, one way or the other -- rendered or refused. This has to be WAITED for and
   * not merely counted: `count()` does not retry, and the first version of this read 0 because the
   * Markdown chunk had not loaded yet -- which made every assertion below it pass on an empty
   * subtree. An assertion about what is ABSENT is worthless until what should be PRESENT is there.
   */
  await expect(notes.locator('[data-note-diagram]')).toHaveCount(4, { timeout: 20000 })
  await expect(notes.locator('[data-note-diagram="drawing"]')).toHaveCount(0, { timeout: 20000 })

  expect(
    await page.evaluate(() => (window as unknown as { __xss?: unknown }).__xss),
  ).toBeUndefined()
  expect(alerts).toEqual([])
  await expect(notes.locator('svg img')).toHaveCount(0)
  await expect(notes.locator('svg foreignObject')).toHaveCount(0)
  await expect(notes.locator('svg a')).toHaveCount(0)
  await expect(notes.locator('svg script')).toHaveCount(0)
  // DOMPurify's svg profile allowlists no `style` ATTRIBUTE here, and the config forbids it.
  await expect(notes.locator('svg [style]')).toHaveCount(0)
  const handlers = await notes.evaluate((root) =>
    [...root.querySelectorAll('svg *')]
      .flatMap((el) => [...el.attributes].map((a) => a.name))
      .filter((name) => name.toLowerCase().startsWith('on')),
  )
  expect(handlers).toEqual([])

  /**
   * EVERY RULE THAT SURVIVED IS ANCHORED TO ITS OWN DIAGRAM. An inline svg's `<style>` is not
   * scoped, so this is the claim that a diagram cannot restyle the app around it. Read off the
   * CSSOM, which is the same place `scopeDiagramStyles` deletes from.
   */
  const selectors = await notes.evaluate((root) =>
    [...root.querySelectorAll('style')].flatMap((el) =>
      [...(el.sheet?.cssRules ?? [])].map((rule) =>
        rule instanceof CSSStyleRule ? rule.selectorText : `@ ${rule.cssText.slice(0, 40)}`,
      ),
    ),
  )
  expect(
    selectors.length,
    'a diagram still carries the stylesheet that makes it legible',
  ).toBeGreaterThan(0)
  expect(selectors.filter((s) => !s.startsWith('#ctws-diagram-'))).toEqual([])
  const css = await notes.evaluate((root) =>
    [...root.querySelectorAll('style')]
      .flatMap((el) => [...(el.sheet?.cssRules ?? [])].map((r) => r.cssText))
      .join('\n'),
  )
  expect(css).not.toContain('url(')
  expect(stray, 'no diagram CSS reached the network').toEqual([])
})

// ------------------------------------------------------------------ what is NOT downloaded (D73 §2)

/** Every URL the page asked for, so the absence of one can be asserted. */
function watchRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  return urls
}

const fetched = (urls: string[], what: RegExp) => urls.filter((u) => what.test(u))
const KATEX = /katex/i
const MERMAID = /mermaid/i

/**
 * WHAT IS IN THE BYTES, not what is in the file names.
 *
 * The three tests below watch REQUESTS, which catches a renderer that is fetched as its own chunk.
 * It does not catch a renderer that was BUNDLED INTO a chunk the page loads anyway -- and that is
 * exactly what a static `import 'rehype-katex'` does: KaTeX lands inside the Markdown chunk, no URL
 * ever says "katex", and a name-based assertion passes while every opened note pays 260 KB.
 * Measured: mutating `NoteMarkdown` to import KaTeX statically, and to import the diagram component
 * eagerly, left all three of them green. So the claim is made on the content of every script and
 * stylesheet the page actually loaded.
 *
 * The two fingerprints are strings that exist in the vendors' bundles and in no source file of this
 * app (grepped): `katex-mathml` is a class KaTeX emits, `flowchart-v2` a diagram id mermaid
 * registers. Asserting on a string rather than on a byte count is what keeps this from being a
 * threshold somebody later raises until it is green again.
 */
test('no chunk a plain note loads contains KaTeX or mermaid', async ({ page }) => {
  const urls = watchRequests(page)
  await seedNote(page, '先问清需求，再排期。\n\n- 一条\n- 两条\n\n**要紧的**那条先做。')
  await expect(notesBlock(page).locator('strong')).toHaveText('要紧的')

  const assets = [...new Set(urls.filter((u) => /\/assets\/[^/]+\.(?:js|css)$/.test(u)))]
  expect(assets.length, 'the page loaded its own code').toBeGreaterThan(1)
  const carries: string[] = []
  for (const url of assets) {
    const body = await (await page.request.get(url)).text()
    if (body.includes('katex-mathml')) carries.push(`${url} carries KaTeX`)
    if (body.includes('flowchart-v2')) carries.push(`${url} carries mermaid`)
  }
  expect(carries).toEqual([])
})

test('a plain note fetches neither mermaid nor katex', async ({ page }) => {
  const urls = watchRequests(page)
  await seedNote(page, '先问清需求，再排期。\n\n- 一条\n- 两条\n\n**要紧的**那条先做。')
  // The note really did render through the Markdown pipeline -- otherwise "nothing was fetched"
  // would be true for the boring reason.
  await expect(notesBlock(page).locator('strong')).toHaveText('要紧的')
  await expect(notesBlock(page).locator('li').first()).toBeVisible()

  expect(fetched(urls, KATEX), 'katex must not be fetched for a note without maths').toEqual([])
  expect(
    fetched(urls, MERMAID),
    'mermaid must not be fetched for a note without a diagram',
  ).toEqual([])
})

test('a note with maths fetches katex and still not mermaid', async ({ page }) => {
  const urls = watchRequests(page)
  await seedNote(page, '面积 $\\pi r^2$ 。')
  await expect(notesBlock(page).locator('.katex').first()).toBeVisible()
  expect(fetched(urls, KATEX).length, 'katex arrives when a note needs it').toBeGreaterThan(0)
  expect(fetched(urls, MERMAID)).toEqual([])
})

test('a note with a diagram fetches mermaid and still not katex', async ({ page }) => {
  const urls = watchRequests(page)
  await seedNote(page, '```mermaid\ngraph TD; A-->B;\n```')
  await expect(notesBlock(page).locator('[data-note-diagram="ready"] svg')).toBeVisible()
  expect(fetched(urls, MERMAID).length, 'mermaid arrives when a note needs it').toBeGreaterThan(0)
  expect(fetched(urls, KATEX)).toEqual([])
})

test("KaTeX's stylesheet ships only woff2, like the app's own two faces", async ({ page }) => {
  /**
   * KaTeX lists a `.woff` AND a `.ttf` after each `.woff2`, across twenty faces -- about 700 KB of
   * files no browser that can run this app will ever ask for. The same Vite plugin that already
   * stripped @fontsource's legacy `.woff` now covers KaTeX too (apps/web/vite.config.ts), and this
   * is the assertion that makes that extension real: `font.spec.ts` only ever looked at the app's
   * OWN stylesheet, so without this the plugin's katex half had no test at all.
   */
  await seedNote(page, '面积 $\\pi r^2$ 。')
  await expect(notesBlock(page).locator('.katex').first()).toBeVisible()
  const href = await page.evaluate(() =>
    [...document.styleSheets]
      .map((s) => s.href)
      .find((url): url is string => !!url?.includes('katex')),
  )
  expect(href, 'the page should have loaded a built KaTeX stylesheet').toBeTruthy()
  const css = await (await page.request.get(href as string)).text()
  expect(css).toContain('.woff2')
  expect(css.match(/url\([^)]*\.(?:woff|ttf)\)/g) ?? []).toEqual([])
})

// ------------------------------------------------------------------------- the writing mode (H)

const writingSource = (page: Page) => page.getByLabel('Markdown source')

test('the full-screen writing mode round-trips the source unchanged', async ({ page }) => {
  const pid = await seedNote(page, '第一行\n\n第二段')
  await editDetail(page)
  // The pane holds the SOURCE, which is what is stored (D73's third decision).
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('第一行\n\n第二段')

  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(writingSource(page)).toHaveValue('第一行\n\n第二段')

  const written =
    '# 标题\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n$x^2$\n\n```mermaid\ngraph TD; A-->B;\n```'
  await writingSource(page).fill(written)
  // The other half of the layer is the rendering of exactly that text.
  await expect(page.locator('[data-writing-preview] h1')).toHaveText('标题')
  await expect(page.locator('[data-writing-preview] table')).toBeVisible()

  await page.getByRole('button', { name: 'Leave full screen' }).click()
  await expect(writingSource(page)).toHaveCount(0)
  // Byte for byte, back in the pane's own field.
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(written)

  const saved = page.waitForResponse(
    (r) => r.request().method() === 'PATCH' && /\/tasks\/[^/]+$/.test(r.url()),
  )
  await page.getByRole('button', { name: 'Save' }).click()
  expect((await saved).ok()).toBeTruthy()

  // And the SOURCE is what the server kept -- never the rendered HTML.
  await page.goto(`/projects/${pid}`)
  const stored = (await (await page.request.get(`/api/v1/projects/${pid}/tasks`)).json()) as {
    tasks: { notes: string | null }[]
  }
  expect(stored.tasks[0]?.notes).toBe(written)
})

test('the unsaved-edit guard fires from the writing mode, and the question is visible', async ({
  page,
}) => {
  const pid = await seedNote(page, '原文')
  /**
   * A SAME-DOCUMENT HISTORY ENTRY FIRST, by walking there with the app's own links.
   *
   * `seedNote` arrives with `page.goto`, and going BACK across a document boundary is a browser
   * navigation React Router never sees -- only `beforeunload` could stop it, and this app
   * deliberately has none (a native prompt would block the automation it is tested with). The first
   * version of this test used that back button, watched the page leave, and would have reported the
   * guard as broken when what was broken was the test's own history. The guard really is engaged
   * here: the pane asks on 关闭 at this point too.
   */
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Projects' }).click()
  await openProject(page, 'P', true)
  await page.getByRole('listitem').filter({ hasText: '读一下' }).first().click()
  await editDetail(page)
  await page.getByRole('button', { name: 'Full screen' }).click()
  await writingSource(page).fill('原文，又写了一段')

  // The browser's back button is the one way out of a layer that covers the whole window.
  await page.goBack()
  // Still here, and the layer stood down so the question is where the answer has to be given.
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`))
  await expect(writingSource(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Task details' })).toContainText(
    'You have unsaved changes. Leaving will discard them',
  )
  await page.getByRole('button', { name: 'Keep editing' }).click()
  // The typing survived the question.
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('原文，又写了一段')
  // And 放弃修改 really does leave, which is what makes the question a question.
  await page.goBack()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page).toHaveURL(/\/projects$/)
})

test('the writing mode stands the single-key shortcuts down', async ({ page }) => {
  await seedNote(page, '原文')
  await editDetail(page)
  await page.getByRole('button', { name: 'Full screen' }).click()
  await writingSource(page).fill('')
  await writingSource(page).press('/')
  // `/` is the capture shortcut. Typed into a note it is a slash.
  await expect(writingSource(page)).toHaveValue('/')
  await expect(page.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
})

// ------------------------------------------------------------------------------- 375px, both modes

test('a note full of wide things still has no horizontal scroll at 375', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 })
  await seedNote(
    page,
    [
      '| 很长的一列标题 | 另一列 | 第三列 | 第四列 |',
      '| --- | --- | --- | --- |',
      '| 内容内容内容内容 | 内容内容 | 内容内容 | 内容内容 |',
      '',
      '```sh',
      'echo "一行很长的命令，长到不可能放进三百七十五像素的视口里面去啊啊啊啊啊"',
      '```',
      '',
      '```mermaid',
      'graph LR;',
      '  这是一个很长的节点名字 --> 另一个很长的节点名字 --> 第三个很长的节点名字;',
      '```',
    ].join('\n'),
  )
  await expect(notesBlock(page).locator('[data-note-diagram="ready"] svg')).toBeVisible()
  const reading = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(reading).toEqual({ doc: 0, body: 0 })

  await editDetail(page)
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(writingSource(page)).toBeVisible()
  const writing = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(writing).toEqual({ doc: 0, body: 0 })
})
