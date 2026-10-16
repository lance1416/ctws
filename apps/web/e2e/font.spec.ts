import { expect, test, type Page } from '@playwright/test'
import { registerFreshUser, apiPost } from './helpers'

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

test('the build ships no legacy .woff nobody requests', async ({ page }) => {
  // @fontsource lists a `.woff` fallback after each `.woff2`; every browser that can run this app
  // reads woff2, so a Vite plugin strips the fallback before the asset is emitted
  // (apps/web/vite.config.ts).
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

test('Chinese is painted with the shipped subset, not a system fallback', async ({ page }) => {
  await registerFreshUser(page)
  // The interface is in English; a project NAME carries the Chinese, because the font has to cover
  // what the person types.
  const made = await apiPost(page, '/projects', { name: '配色重做' })
  await page.goto(`/projects/${made.id}`)
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
