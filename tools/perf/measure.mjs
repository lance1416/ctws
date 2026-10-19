/**
 * Measures how long four pages take to load, as the page-load baseline for the redesign
 * (docs/product/2026-10-redesign/README.md section 2: five runs per page, the median must not
 * grow past 110% after the switch).
 *
 *   node tools/perf/measure.mjs --base http://localhost:3300 \
 *     --email me@example.com --password '...' \
 *     --project <project id> --person <person id> --query <word> [--runs 5] [--out result.json]
 *
 * It runs against the built image (the API container serving the web build), signed in as the
 * account given, so the numbers are what that account sees. Each run opens a fresh browser
 * context with the session cookie and nothing cached: every run downloads the bundle again, so
 * the number is a first visit, and a run never profits from what the run before it fetched.
 *
 * Two numbers per run, both in milliseconds:
 *
 * 1. `total`: from the call to `page.goto` until BOTH of these hold, whichever comes last:
 *      - the main content region shows at least one row of data, and
 *      - every API request the page started since `goto` has been answered, with no new one
 *        begun in the 300 ms after the last answer (the settle window is not counted).
 *    "The main content region" is the landmark `main` (or `[role=main]`). "A row of data" is any
 *    `li`, `tr`, `article`, `[role=row]`, `[role=listitem]` or `[role=option]` inside it with
 *    non-empty text. Nothing here names a class or a test id, so the same check holds on any
 *    markup that keeps the landmark and lists its data as list items, table rows or articles.
 *    For a page that names its subject (a project, a person), `expect` also has to appear in
 *    the document text, so a list that drew before the subject loaded does not end the clock.
 *
 * 2. Per API request, `server`: the time from the request leaving the browser to the first byte
 *    of the response, as Chromium reports it (`responseStart - requestStart`). The API sends no
 *    timing header, so this is the server's time plus one loopback hop through Docker; on this
 *    machine that hop is well under a millisecond, but it is in the number. `transfer` is the
 *    rest, first byte to last.
 *
 * Search is a dialog, not a page, so its clock starts when the word is typed into the search box
 * and ends when the results list (`[role=listbox]`) shows at least one option and every search
 * request has been answered. The app's 150 ms typing pause is inside the number.
 *
 * Each page gets one extra run first that is not recorded: the browser's first page of a session
 * carries its own start-up cost, which is not the page's.
 *
 * Output: a JSON file with every run's numbers (so the report can show them all), and a table of
 * medians and maxima on stdout.
 */
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

// Playwright is the web app's dev dependency; this script has no package of its own, so it
// resolves the package as the web app would.
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3300' },
    email: { type: 'string' },
    password: { type: 'string' },
    project: { type: 'string' },
    person: { type: 'string' },
    query: { type: 'string' },
    runs: { type: 'string', default: '5' },
    out: { type: 'string', default: 'perf-result.json' },
  },
})
for (const k of ['email', 'password', 'project', 'person', 'query']) {
  if (!opt[k]) {
    console.error(`missing --${k}`)
    process.exit(2)
  }
}
const RUNS = Number(opt.runs)
const BASE = opt.base.replace(/\/$/, '')
const WEB = { 'x-ctws-client': 'web' }
const SETTLE_MS = 300
const TIMEOUT_MS = 30_000

const ROW = 'li, tr, article, [role=row], [role=listitem], [role=option]'

/** True once `main` holds a row with text and, when given, the document shows `expect`. */
function rowsDrawn({ expect }) {
  const main = document.querySelector('main, [role=main]')
  if (!main) return false
  const rows = [
    ...main.querySelectorAll('li, tr, article, [role=row], [role=listitem], [role=option]'),
  ]
  if (!rows.some((r) => (r.textContent ?? '').trim().length > 0)) return false
  return expect ? (document.body.textContent ?? '').includes(expect) : true
}

/** True once the search results list holds at least one option. */
function optionsDrawn() {
  const list = document.querySelector('[role=listbox]')
  return !!list && list.querySelectorAll('[role=option]').length > 0
}

/** Watches the API requests of one page: in flight, finished, and each one's timing. */
function watchApi(page, since) {
  const seen = []
  let inFlight = 0
  let lastDone = since
  page.on('request', (req) => {
    if (!req.url().includes('/api/')) return
    inFlight++
    const entry = {
      method: req.method(),
      path: shape(req.url()),
      started: performance.now() - since,
    }
    seen.push(entry)
    req.response().then(async (res) => {
      entry.status = res?.status() ?? null
      try {
        await res?.finished()
      } catch {
        // A cancelled request has no timing; it is reported as such.
      }
      const t = req.timing()
      entry.server =
        t.responseStart >= 0 && t.requestStart >= 0 ? round(t.responseStart - t.requestStart) : null
      entry.transfer =
        t.responseEnd >= 0 && t.responseStart >= 0 ? round(t.responseEnd - t.responseStart) : null
      entry.done = performance.now() - since
      lastDone = performance.now()
      inFlight--
    })
  })
  return {
    requests: seen,
    /** Resolves when nothing is in flight and nothing new began for SETTLE_MS; gives the last answer's time. */
    async settled(deadline) {
      for (;;) {
        if (performance.now() > deadline) throw new Error('API requests did not settle in time')
        if (inFlight === 0 && performance.now() - lastDone >= SETTLE_MS) return lastDone
        await new Promise((r) => setTimeout(r, 20))
      }
    },
  }
}

const round = (n) => Math.round(n * 10) / 10

/** The path with its query's parameter names, so `/tasks?q` and `/tasks?scheduledOn` stay apart. */
function shape(url) {
  const u = new URL(url)
  const keys = [...new Set(u.searchParams.keys())].sort()
  return keys.length ? `${u.pathname}?${keys.join('&')}` : u.pathname
}

/** Signs in once over HTTP; the cookie is what every run's context starts with. */
async function signIn() {
  const ctx = await chromium.launch().then((b) => b.newContext({ baseURL: BASE }))
  const res = await ctx.request.post('/api/v1/auth/login', {
    headers: WEB,
    data: { email: opt.email, password: opt.password },
  })
  if (res.status() !== 200) throw new Error(`login: ${res.status()} ${await res.text()}`)
  const cookies = await ctx.storageState().then((s) => s.cookies)
  await ctx.browser().close()
  return cookies
}

/** One run of one page: a fresh context, the cookie, `goto`, and the two clocks. */
async function runPage(browser, cookies, spec) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
  })
  await context.addCookies(cookies)
  const page = await context.newPage()
  const t0 = performance.now()
  const api = watchApi(page, t0)
  let rowsAt = null
  let apiDoneAt = null
  let error = null
  try {
    if (spec.search) {
      // Reach the shell first; the clock starts at the typing, not at the page.
      await page.goto(spec.path)
      await page.waitForFunction(rowsDrawn, { expect: null }, { timeout: TIMEOUT_MS })
      await api.settled(performance.now() + TIMEOUT_MS)
      api.requests.length = 0
      await page.keyboard.press('f')
      const box = page.getByRole('combobox')
      await box.waitFor({ timeout: TIMEOUT_MS })
      const t1 = performance.now()
      await box.fill(spec.search)
      await page.waitForFunction(optionsDrawn, null, { timeout: TIMEOUT_MS })
      rowsAt = performance.now() - t1
      apiDoneAt = (await api.settled(t1 + TIMEOUT_MS)) - t1
      for (const r of api.requests) {
        r.started = round(r.started - (t1 - t0))
        r.done = round(r.done - (t1 - t0))
      }
      const options = await page.locator('[role=listbox] [role=option]').count()
      return finish({ rowsAt, apiDoneAt, options, requests: api.requests })
    }
    await page.goto(spec.path)
    await page.waitForFunction(rowsDrawn, { expect: spec.expect ?? null }, { timeout: TIMEOUT_MS })
    rowsAt = performance.now() - t0
    apiDoneAt = (await api.settled(t0 + TIMEOUT_MS)) - t0
    const rows = await page.locator(`main ${ROW}, [role=main] ${ROW}`).count()
    return finish({ rowsAt, apiDoneAt, rows, requests: api.requests })
  } catch (e) {
    error = e.message
    return { error, rowsAt, apiDoneAt, requests: api.requests }
  } finally {
    await context.close()
  }
}

function finish(r) {
  return {
    ...r,
    rowsAt: round(r.rowsAt),
    apiDoneAt: round(r.apiDoneAt),
    total: round(Math.max(r.rowsAt, r.apiDoneAt)),
    requests: r.requests.map((q) => ({ ...q, started: round(q.started), done: round(q.done) })),
  }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : round((s[m - 1] + s[m]) / 2)
}

const pages = [
  { name: 'Today', path: '/tasks/today' },
  { name: 'Project', path: `/projects/${opt.project}` },
  { name: 'Person', path: `/people/${opt.person}` },
  { name: 'Search', path: '/tasks/today', search: opt.query },
]

const cookies = await signIn()
const browser = await chromium.launch()
const version = browser.version()
const result = {
  base: BASE,
  chromium: version,
  runs: RUNS,
  at: new Date().toISOString(),
  pages: [],
}

for (const spec of pages) {
  // One run first that is thrown away: the browser's first page of a session carries its own
  // start-up cost (the dry run showed one 6.4 s Today against 0.6 s after it), which is not the page.
  await runPage(browser, cookies, spec)
  const runs = []
  for (let i = 0; i < RUNS; i++) runs.push(await runPage(browser, cookies, spec))
  const ok = runs.filter((r) => !r.error)
  const summary = {
    total: ok.length
      ? { median: median(ok.map((r) => r.total)), max: Math.max(...ok.map((r) => r.total)) }
      : null,
    rowsAt: ok.length
      ? { median: median(ok.map((r) => r.rowsAt)), max: Math.max(...ok.map((r) => r.rowsAt)) }
      : null,
    requests: {},
  }
  // Per request path across runs: the median and max of its server time.
  for (const r of ok)
    for (const q of r.requests) {
      const key = `${q.method} ${q.path}`
      summary.requests[key] ??= { server: [], transfer: [] }
      summary.requests[key].server.push(q.server)
      summary.requests[key].transfer.push(q.transfer)
    }
  for (const [key, s] of Object.entries(summary.requests)) {
    const server = s.server.filter((x) => x !== null)
    summary.requests[key] = {
      count: s.server.length,
      server: server.length ? { median: median(server), max: Math.max(...server) } : null,
    }
  }
  result.pages.push({ ...spec, runs, summary })
  const t = summary.total
  console.log(
    `${spec.name.padEnd(8)} total median ${t?.median ?? '-'} ms, max ${t?.max ?? '-'} ms (${ok.length}/${RUNS} runs)`,
  )
  for (const [key, s] of Object.entries(summary.requests))
    console.log(
      `  ${key.padEnd(44)} server median ${s.server?.median ?? '-'} ms, max ${s.server?.max ?? '-'} ms`,
    )
  for (const r of runs.filter((r) => r.error)) console.log(`  run failed: ${r.error}`)
}

await browser.close()
writeFileSync(opt.out, JSON.stringify(result, null, 2))
console.log(`written ${opt.out}`)
