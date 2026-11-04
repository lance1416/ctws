/**
 * Takes the landing page's screenshots from a running app holding the acceptance data
 * (tools/seed/acceptance.mjs, typical account), with the server's clock pinned at
 * 2026-10-22T08:10:00Z. The browser's clock is pinned to the same instant: a page that read the
 * real date would draw "today" a fortnight away from the server's.
 *
 *   node tools/landing/capture.mjs --base http://localhost:3310 --password '<seed password>' \
 *     --out apps/web/public/landing
 *
 * Each shot is written as WebP with `cwebp` (brew install webp), a third of the PNG's weight;
 * `--format png` keeps the PNGs instead, for a board.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3310' },
    email: { type: 'string', default: 'typical@example.com' },
    password: { type: 'string', default: process.env.CTWS_SEED_PASSWORD ?? '' },
    out: { type: 'string', default: 'apps/web/public/landing' },
    format: { type: 'string', default: 'webp' },
  },
})
if (!opt.password) throw new Error('give --password or set CTWS_SEED_PASSWORD')

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const NOW = new Date('2026-10-22T08:10:00Z')
const WEB = { 'x-ctws-client': 'web' }

// A note worth showing: the seed's notes are there to test the edges, not to be read.
const showcase = (
  mira,
) => `The onsite has one system design round, 45 minutes, whiteboard. [@Mira Chen](ctws://person/${mira.id}) says they like a payments ledger question, so start there.

## Before the round

- [x] Read the chapter on transactions
- [ ] Sketch the **double-entry** ledger on paper
- [ ] Ask Priya how long the debrief takes

## Numbers to have ready

| Thing | Rough size | Why it matters |
| --- | --- | --- |
| Payments a day | 40 million | Write load on the ledger |
| Retries | 2% | Needs idempotency keys |

## Payments, step by step

Each step writes once. A retry finds the key it wrote and stops there, so the customer is charged once however often the button is pressed.

\`\`\`ts
const key = idempotencyKey(payment.id, attempt)
if (await seen.has(key)) return 'already applied' // no double charge
\`\`\`
`

const browser = await chromium.launch()

// One sign-in for the whole run: sign-in is limited per email per minute, and there are thirty shots.
const signIn = await browser.newContext({ baseURL: opt.base })
const signedIn = await signIn.request.post('/api/v1/auth/login', {
  headers: WEB,
  data: { email: opt.email, password: opt.password },
})
if (!signedIn.ok()) throw new Error(`sign in: ${signedIn.status()} ${await signedIn.text()}`)
const storageState = await signIn.storageState()
await signIn.close()

async function session(theme, viewport, scale, isMobile = false) {
  const ctx = await browser.newContext({
    baseURL: opt.base,
    storageState,
    viewport,
    deviceScaleFactor: scale,
    isMobile,
    hasTouch: isMobile,
    timezoneId: 'Europe/London',
    colorScheme: theme,
  })
  await ctx.addInitScript((t) => localStorage.setItem('ctws:theme', t), theme)
  const page = await ctx.newPage()
  await page.clock.setFixedTime(NOW)
  return { ctx, page }
}

const api = async (ctx, path, init, method = init ? 'post' : 'get') => {
  const res = await ctx.request[method](`/api/v1${path}`, { headers: WEB, data: init })
  if (!res.ok()) throw new Error(`${path}: ${res.status()} ${await res.text()}`)
  return res.status() === 204 ? null : res.json()
}

/** Each list comes keyed by its kind (`{ projects: [...] }`). */
const list = (body) =>
  Array.isArray(body) ? body : (Object.values(body).find(Array.isArray) ?? [])

/** Fonts, images and the last request in; a screenshot taken mid-load shows skeletons. */
async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

mkdirSync(opt.out, { recursive: true })

/** Where a shot goes, and once taken, turned into the format asked for. */
const target = (name) => join(opt.out, `${name}.png`)
function finish(name) {
  if (opt.format === 'png') return
  execFileSync('cwebp', ['-quiet', '-q', '85', target(name), '-o', join(opt.out, `${name}.webp`)])
  rmSync(target(name))
}

// Find what the shots open, and add the note once.
const { ctx: probe } = await session('light', { width: 800, height: 600 }, 1)
const projects = list(await api(probe, '/projects'))
const jobHunt = projects.find((p) => p.name === 'Job hunt')
const people = list(await api(probe, '/people'))
const mira = people.find((p) => (p.name ?? p.displayName ?? '').startsWith('Mira'))
if (!jobHunt || !mira) throw new Error('the typical account is not seeded')
// Written afresh each run, so a change to the text here is what the next shot shows.
for (const old of list(await api(probe, '/notes')).filter((n) => n.title === 'System design prep'))
  await api(probe, `/notes/${old.id}`, undefined, 'delete')
const note = await api(probe, '/notes', {
  title: 'System design prep',
  body: showcase(mira),
  anchor: null,
})
await probe.close()

const DESK = [
  { name: 'today', path: '/today', viewport: { width: 1920, height: 1080 } },
  {
    name: 'workbench',
    path: '/',
    viewport: { width: 1920, height: 1080 },
    // The last row is widgets still to come; the page says what CTWS does now.
    clip: { x: 0, y: 0, width: 1920, height: 860 },
  },
  {
    name: 'project',
    path: `/projects/${jobHunt.id}?view=board`,
    viewport: { width: 1440, height: 900 },
    act: async (page) => {
      await page.getByText('Stage', { exact: true }).click()
      await page.evaluate(() => document.activeElement?.blur())
    },
  },
  { name: 'person', path: `/people/${mira.id}`, viewport: { width: 1440, height: 900 } },
  { name: 'note', path: `/notes/${note.id}`, viewport: { width: 1440, height: 900 } },
  {
    name: 'capture',
    path: '/today',
    viewport: { width: 1440, height: 900 },
    act: async (page) => {
      await page.keyboard.press('c')
      await page.keyboard.type('https://stripe.com/blog/idempotency', { delay: 10 })
    },
    // The panel alone: the page lays it on its own ground.
    element: (page) => page.getByRole('dialog', { name: 'Capture' }),
  },
  {
    name: 'search',
    path: '/today',
    viewport: { width: 1440, height: 900 },
    act: async (page) => {
      await page.keyboard.press('Control+k')
      await page.keyboard.type('stripe', { delay: 30 })
    },
    element: (page) =>
      page
        .getByRole('combobox')
        .locator('xpath=ancestor::*[contains(@class, "rounded-container")][1]'),
  },
]
const PHONE = [
  { name: 'phone-today', path: '/today' },
  { name: 'phone-workbench', path: '/' },
  { name: 'phone-project', path: `/projects/${jobHunt.id}` },
  { name: 'phone-person', path: `/people/${mira.id}` },
  { name: 'phone-note', path: `/notes/${note.id}` },
]

for (const theme of ['light', 'dark']) {
  for (const shot of DESK) {
    const { ctx, page } = await session(theme, shot.viewport, 2)
    await page.goto(shot.path)
    await settle(page)
    if (shot.act) {
      await page.locator('body').click({ position: { x: 5, y: shot.viewport.height - 5 } })
      await shot.act(page)
      await settle(page)
    } else {
      // No caret or focused line in a still: the editor takes focus when a note opens.
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(200)
    }
    const name = `${shot.name}-${theme}`
    if (shot.element) await shot.element(page).screenshot({ path: target(name) })
    else await page.screenshot({ path: target(name), clip: shot.clip })
    finish(name)
    await ctx.close()
  }
  for (const shot of PHONE) {
    // Twice the pixels is sharp at the width the page shows it, and a third less than three times.
    const { ctx, page } = await session(theme, { width: 393, height: 852 }, 2, true)
    await page.goto(shot.path)
    await settle(page)
    await page.evaluate(() => document.activeElement?.blur())
    await page.waitForTimeout(200)
    const name = `${shot.name}-${theme}`
    await page.screenshot({ path: target(name) })
    finish(name)
    await ctx.close()
  }
}
await browser.close()
