import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The self-hosted CJK webfont, and the caching that makes it a one-time cost.
 *
 * These run against the real container, which is the only place the two things that matter are
 * true at once: the asset filename carries the hash Vite just built, and the cache headers are the
 * ones `@fastify/static` is registered with in `apps/api/src/app.ts`.
 */

/** The `/assets/...woff2` URL the built stylesheet points at, read out of the live stylesheet. */
async function fontUrl(page: Page): Promise<string> {
  const href = await page.evaluate(() =>
    [...document.styleSheets]
      .map((sheet) => sheet.href)
      .find((url): url is string => !!url?.includes('/assets/')),
  )
  expect(href, 'the page should load a built stylesheet from /assets').toBeTruthy()
  const css = await (await page.request.get(href!)).text()
  const match = css.match(/url\((\/assets\/noto-sans-sc-subset-[^)]+\.woff2)\)/)
  const url = match?.[1]
  expect(url, 'the built CSS should point at the content-hashed CJK subset').toBeTruthy()
  return url as string
}

/** Waits until the CJK face has actually been applied, not merely declared. */
async function fontReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.load('600 23px "CTWS Noto Sans SC"', '今天项目'))
  await page.waitForFunction(() => document.fonts.check('600 23px "CTWS Noto Sans SC"', '今天'))
}

test('no font is fetched from a third-party host', async ({ page }) => {
  // index.html used to carry two preconnects and a render-blocking stylesheet for Inter -- a font
  // nothing in the app ever referenced -- which had to time out before first paint when offline.
  // Both faces are self-hosted now, so the page must reach no font CDN and link to no absolute URL.
  // Asserted on font hosts and on the document's own links rather than on "every request went to
  // our origin", because a filtering proxy on the developer's machine can inject requests of its
  // own and that has nothing to do with what this app ships.
  const cdn: string[] = []
  page.on('request', (req) => {
    if (/fonts\.(googleapis|gstatic)\.com|fonts\.bunny\.net|use\.typekit/.test(req.url()))
      cdn.push(req.url())
  })
  await registerFreshUser(page)
  await fontReady(page)
  expect(cdn).toEqual([])

  const external = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('link[href], script[src]')]
      .map((el) => el.getAttribute('href') ?? el.getAttribute('src') ?? '')
      .filter((url) => /^(https?:)?\/\//.test(url)),
  )
  expect(external.filter((url) => !url.includes('local.adguard.org'))).toEqual([])
})

test('the build ships no legacy .woff nobody requests', async ({ page }) => {
  // @fontsource lists a `.woff` fallback after each `.woff2`; every browser that can run this app
  // has had woff2 since 2016, so those three files were 69,896 B of dead weight in the image. A
  // Vite plugin strips the fallback before the asset is emitted (apps/web/vite.config.ts).
  await page.goto('/login')
  const href = await page.evaluate(() =>
    [...document.styleSheets]
      .map((sheet) => sheet.href)
      .find((url): url is string => !!url?.includes('/assets/')),
  )
  const css = await (await page.request.get(href!)).text()
  expect(css).toContain('.woff2')
  expect(css.match(/url\([^)]*\.woff\)/g) ?? []).toEqual([])
})

test('the CJK subset is one content-hashed request, cached immutably for a year', async ({
  page,
}) => {
  await registerFreshUser(page)
  const url = await fontUrl(page)

  const res = await page.request.get(url)
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable')
  // One file, not a chunked set: the container speaks HTTP/1.1, where 13-14 chunk requests cost
  // round-trip waves. Size is asserted loosely -- the point is that this is the GB2312 budget and
  // not the 124.5 KiB chrome-only subset, which would fall back per glyph inside a task title.
  const bytes = (await res.body()).length
  expect(bytes).toBeGreaterThan(1_500_000)
  expect(bytes).toBeLessThan(2_000_000)
})

test('index.html is never cached immutably, or no deploy would be seen again', async ({ page }) => {
  // Not content-hashed, so its bytes DO change at the same URL. `no-cache` means revalidate, and
  // the server still answers a conditional request with a cheap 304.
  const res = await page.request.get('/')
  expect(res.status()).toBe(200)
  expect(res.headers()['cache-control']).toBe('no-cache')
  expect(res.headers()['cache-control']).not.toContain('immutable')

  const etag = res.headers()['etag']
  expect(etag).toBeTruthy()
  const again = await page.request.get('/', { headers: { 'if-none-match': etag as string } })
  expect(again.status()).toBe(304)
})

test('re-opening the app does not re-download the font', async ({ page, context }) => {
  await registerFreshUser(page)
  await fontReady(page)
  const url = await fontUrl(page)

  // Resource Timing, not the request log: a cache hit is exactly the case where no request is
  // made, so the only honest measure is how many bytes crossed the wire. `transferSize` is 0 for a
  // hit and non-zero even for a 304, because the response headers still cross.
  const transferred = (target: Page, path: string) =>
    target.evaluate(
      (u) =>
        performance
          .getEntriesByType('resource')
          .filter((e) => new URL(e.name).pathname === u)
          .map((e) => (e as PerformanceResourceTiming).transferSize),
      path,
    )

  const first = await transferred(page, url)
  expect(first, 'the first load should fetch the font over the network').toHaveLength(1)
  expect(first[0]).toBeGreaterThan(1_000_000)

  // A NEW PAGE in the same context, not another goto in the same one. A second navigation inside
  // one renderer is served by its in-memory cache whatever the headers say, so it would pass even
  // with `no-cache` -- measured. Closing the page and opening another keeps the context's cookies
  // and disk cache but throws the memory cache away, which is what actually happens when the user
  // closes the tab and opens the app again tomorrow. With `immutable` Chromium then reuses the
  // file without asking; with `no-cache` it has to revalidate, and those bytes show up here.
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/')
  await fontReady(reopened)
  const second = await transferred(reopened, url)
  expect(
    second.filter((bytes) => bytes > 0),
    `re-opening transferred bytes for the font: ${JSON.stringify(second)}`,
  ).toEqual([])
})

test('Chinese is painted with the shipped subset, not a system fallback', async ({ page }) => {
  await registerFreshUser(page)
  // The interface is in English, so the h1 that used to carry Chinese no longer does. A project
  // NAME still can -- the font has to cover what the person types, which is the thing this test
  // is really about.
  const made = await page.request.post('/api/v1/projects', {
    headers: { 'x-ctws-client': 'web' },
    data: { name: '配色重做' },
  })
  expect(made.ok()).toBe(true)
  await page.goto(`/projects/${(await made.json()).id}`)
  await fontReady(page)
  const heading = page.getByRole('heading', { level: 1, name: '配色重做' })
  await expect(heading).toBeVisible()

  // Computed style only echoes the CSS. This asks Chrome which font file it actually rasterised
  // the heading with. The subset is renamed to `CTWS Noto Sans SC` by the generator precisely so
  // the answer cannot be confused with an installed `Noto Sans SC`.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument')
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'h1' })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  expect(fonts.map((f) => f.familyName)).toContain('CTWS Noto Sans SC')
})

test('400, 500, 600 and 700 are four distinct weights on Chinese', async ({ page }) => {
  await registerFreshUser(page)
  await fontReady(page)

  // The defect this answers: Microsoft YaHei, which won the stack before, has three faces, so
  // `font-medium` (500) rendered pixel-identical to 400 and `font-semibold` (600) rendered Bold
  // 700. The designed scale was one step where it claimed three. A variable webfont interpolates,
  // so each asked weight must now be its own rendering.
  //
  // RASTERISED INK, not screenshots of DOM nodes and not computed style. Computed style only
  // echoes the CSS and would have "passed" on the broken font. Stacked DOM nodes do not work
  // either: successive lines land on fractional device pixels, so their bitmaps differ by subpixel
  // phase alone and four stacked lines come out "distinct" even on a font with two faces --
  // measured, which is why this is written this way. Drawing each weight at the same origin on a
  // canvas and summing the alpha of every pixel is position-independent: two weights that resolve
  // to the same face give the same total to the last bit.
  const ink = await page.evaluate(async () => {
    const family = getComputedStyle(document.body).fontFamily
    const text = '今天项目重做简陋'
    const out: Record<number, number> = {}
    for (const weight of [400, 500, 600, 700]) {
      await document.fonts.load(`${weight} 192px ${family}`, text)
      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 240
      const ctx = canvas.getContext('2d')!
      ctx.font = `${weight} 192px ${family}`
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#000'
      ctx.fillText(text, 0, 0)
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let sum = 0
      for (let i = 3; i < pixels.length; i += 4) sum += pixels[i]!
      out[weight] = sum
    }
    return out
  })

  const steps = [ink[400]!, ink[500]!, ink[600]!, ink[700]!]
  expect(new Set(steps).size, `weights that render the same: ${JSON.stringify(ink)}`).toBe(4)
  // And in the right order: heavier must mean more ink, or the steps are distinct by accident.
  expect(steps, `not monotonic: ${JSON.stringify(ink)}`).toEqual([...steps].sort((a, b) => a - b))
})
