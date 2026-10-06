import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { registerFreshUser } from './helpers'

/**
 * The self-hosted CJK webfont, and the caching that makes it a one-time cost.
 *
 * These run against the real container, which is the only place the two things that matter are
 * true at once: the asset filename carries the hash Vite just built, and the cache headers are the
 * ones `@fastify/static` is registered with in `apps/api/src/app.ts`.
 */

/** The `/assets/...woff2` URL the built stylesheet points at, read out of the live stylesheet. */
async function fontUrl(page: import('@playwright/test').Page): Promise<string> {
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
async function fontReady(page: import('@playwright/test').Page): Promise<void> {
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

test('a second navigation does not re-download the font', async ({ page }) => {
  await registerFreshUser(page)
  await fontReady(page)
  const url = await fontUrl(page)

  // Resource Timing, not the request log: a cache hit is exactly the case where no request is made,
  // so the only honest measure is how many bytes crossed the wire. `transferSize` is 0 for a hit.
  const transferred = (target: string) =>
    page.evaluate(
      (u) =>
        performance
          .getEntriesByType('resource')
          .filter((e) => new URL(e.name).pathname === u)
          .map((e) => (e as PerformanceResourceTiming).transferSize),
      target,
    )

  const first = await transferred(url)
  expect(first, 'the first load should fetch the font over the network').toHaveLength(1)
  expect(first[0]).toBeGreaterThan(1_000_000)

  await page.goto('/')
  // `fontReady` above and again here is what makes the next assertion mean something: the face IS
  // applied on this second document, so zero transferred bytes can only be a cache hit. (An empty
  // list is the strongest form of the same result -- Chromium did not even open a connection.
  // Without `immutable` it instead revalidates, and the measured behaviour of this server before
  // the fix was a full 200 with the whole body, which lands here as ~1.8 MB.)
  await fontReady(page)
  const second = await transferred(url)
  expect(
    second.filter((bytes) => bytes > 0),
    `second navigation transferred bytes for the font: ${JSON.stringify(second)}`,
  ).toEqual([])
})

test('Chinese is painted with the shipped subset, not a system fallback', async ({ page }) => {
  await registerFreshUser(page)
  await fontReady(page)
  const heading = page.getByRole('heading', { level: 1, name: '今天' })
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

test('400, 500 and 600 are three distinct weights on Chinese', async ({ page }) => {
  await registerFreshUser(page)
  await fontReady(page)

  // The defect this answers: on Microsoft YaHei, which has three faces, `font-medium` (500) renders
  // pixel-identical to 400 and `font-semibold` (600) renders Bold 700 -- so the designed scale was
  // one step, not three. A variable webfont interpolates, so each step must now be its own image.
  // Rasterised pixels, not computed style: computed style would have "passed" on the broken font.
  await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.id = 'weight-probe'
    probe.style.cssText =
      'position:fixed;left:0;top:0;z-index:99999;background:#fff;color:#000;font-size:48px;line-height:1.2'
    for (const weight of [400, 500, 600, 700]) {
      const line = document.createElement('div')
      line.setAttribute('data-weight', String(weight))
      line.style.fontWeight = String(weight)
      line.textContent = '今天项目重做'
      probe.append(line)
    }
    document.body.append(probe)
  })
  await page.evaluate(() =>
    Promise.all(
      [400, 500, 600, 700].map((w) =>
        document.fonts.load(`${w} 48px "CTWS Noto Sans SC"`, '今天项目重做'),
      ),
    ),
  )

  const inked: Record<number, string> = {}
  for (const weight of [400, 500, 600, 700]) {
    const shot = await page.locator(`#weight-probe [data-weight="${weight}"]`).screenshot()
    inked[weight] = createHash('sha256').update(shot).digest('hex')
  }
  expect(new Set(Object.values(inked)).size, `identical renderings: ${JSON.stringify(inked)}`).toBe(
    4,
  )
})
