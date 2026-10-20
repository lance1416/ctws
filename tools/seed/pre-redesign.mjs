/**
 * Fills a workspace with the "before the redesign" data set from
 * docs/product/2026-10-redesign/acceptance-data.md, through the API of the version BEFORE the
 * redesign (main at 3863d95 or later, schema 0027). The result is dumped as the SQL fixture the
 * migration tests start from (`apps/api/tests/fixtures/pre-redesign.sql`), so every guess the
 * migration makes (how a name splits, which companies look alike, which parents change status)
 * has a known input.
 *
 *   node tools/seed/pre-redesign.mjs --base http://localhost:3301 [--email ...] [--password ...]
 *
 * Registers the account if it does not exist (the stack must allow registration or be empty),
 * then creates everything. Not idempotent: run it against an empty database.
 *
 * What is in here, and why (each line is a case the migration must handle, FR-090 to FR-099):
 *   names      欧阳娜娜 (compound surname), Mary Jane Watson (middle name), Cher (one word),
 *              "Li, Wendy" (comma), "王 磊" (a space inside a Chinese name)
 *   companies  "Stripe", "stripe", "Stripe Inc." (same, differently written); a title with no
 *              company; a person with no city
 *   circles    one person in each of family, friend, work
 *   projects   one in each of the six colour slots
 *   tasks      a parent set to In progress by hand whose children are all To do; a parent with a
 *              planned day whose children partly have one
 *   meetings   a series with a note on the series; one place that is a URL, one that is an address
 *   links      belongs, attends, recommends, about
 *   v1.5 adds  a parent whose leaves all have their own planned day; a soft-deleted task and
 *              person with edges to them; two Cambridges (one stored as the bare name); a place
 *              written "Zoom: https://..." (text plus a URL, so still a place); a second account
 *              that also has a person at "Stripe" (never merged across accounts)
 */
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3301' },
    email: { type: 'string', default: 'lance@example.com' },
    password: { type: 'string', default: 'correct horse battery' },
    timezone: { type: 'string', default: 'Europe/London' },
  },
})

const WEB = { 'x-ctws-client': 'web' }
let cookie = ''

async function call(method, path, body) {
  const res = await fetch(`${opt.base}/api/v1${path}`, {
    method,
    headers: {
      ...WEB,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const set = res.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const post = (path, body) => call('POST', path, body)
const patch = (path, body) => call('PATCH', path, body)

// ---- account ---------------------------------------------------------------------------------

try {
  await post('/auth/register', { email: opt.email, password: opt.password, timezone: opt.timezone })
} catch (e) {
  if (!/409|403/.test(String(e))) throw e
  await post('/auth/login', { email: opt.email, password: opt.password })
}

// ---- projects: one per colour slot -----------------------------------------------------------

const projectNames = ['CTWS', 'Job hunt', 'rust-analyzer', 'Moving flat', 'Find a lawyer', 'Thesis']
const projects = {}
for (const [i, name] of projectNames.entries()) {
  const p = await post('/projects', { name })
  await patch(`/projects/${p.id}`, { color: `project-${i + 1}` })
  projects[name] = p.id
}
const { projects: list } = await call('GET', '/projects')
const inbox = list.find((p) => p.isInbox)

// ---- people ----------------------------------------------------------------------------------

const person = (fields) => post('/people', fields)

const ouyang = await person({
  name: '欧阳娜娜',
  org: 'Stripe',
  title: 'Product manager',
  circle: 'family',
  city: 'Shanghai, China',
  hometown: 'Chengdu, Sichuan, China',
  birthday: { calendar: 'lunar', month: 9, day: 20 },
  channels: [{ kind: 'email', value: 'nana@example.com', label: 'Work' }],
  projectIds: [projects['Job hunt']],
})
const mary = await person({
  name: 'Mary Jane Watson',
  org: 'stripe',
  title: 'Staff engineer',
  circle: 'friend',
  city: 'London, England, United Kingdom',
  birthday: { calendar: 'solar', year: 1992, month: 11, day: 4 },
  channels: [{ kind: 'phone', value: '+44 20 7946 0958' }],
  projectIds: [projects['Job hunt'], projects['CTWS']],
})
// A title without a company: the migration keeps the title in the note and reports it.
const cher = await person({ name: 'Cher', title: 'Singer', circle: 'work' })
const wendy = await person({
  name: 'Li, Wendy',
  org: 'Stripe Inc.',
  title: 'Recruiter',
  circle: 'work',
  city: 'Shenzhen, Guangdong, China',
})
const wang = await person({
  name: '王 磊',
  org: 'Tencent',
  title: 'Engineer',
  circle: 'friend',
  city: 'Shanghai, China',
  birthday: { calendar: 'solar', month: 2, day: 29 },
})

// ---- tasks -----------------------------------------------------------------------------------

const task = (projectId, title, fields = {}) => post('/tasks', { projectId, title, ...fields })

// A parent set to In progress by hand; every child is To do. After the migration it is To do
// and appears in the report under "Parents whose status changed".
const amazon = await task(projects['Job hunt'], 'Amazon', { status: 'in_progress' })
await task(projects['Job hunt'], 'SDE II, AWS Payments', { parentId: amazon.id })
await task(projects['Job hunt'], 'Prepare the system design round', {
  parentId: amazon.id,
  dueAt: '2026-11-03T18:00:00+00:00',
})

// A parent with a planned day. One child has its own; the other inherits it on migration.
const stripe = await task(projects['Job hunt'], 'Stripe', { scheduledOn: '2026-10-20' })
await task(projects['Job hunt'], 'Phone screen prep', {
  parentId: stripe.id,
  scheduledOn: '2026-10-21',
})
await task(projects['Job hunt'], 'Send the take-home', { parentId: stripe.id })

const headline = await task(projects['Job hunt'], 'Update the LinkedIn headline')
const flights = await task(projects['Job hunt'], 'Book flights to Seattle')
await call('PUT', `/tasks/${flights.id}/dependencies/${headline.id}`)

const redesign = await task(projects['CTWS'], 'Redesign')
const batch2 = await task(projects['CTWS'], 'Batch 2', { parentId: redesign.id })
await task(projects['CTWS'], 'Tokens', { parentId: batch2.id, status: 'done' })
await task(projects['CTWS'], 'Shell', { parentId: batch2.id, status: 'in_progress' })
await task(projects['CTWS'], 'Old idea', { parentId: redesign.id, status: 'backlog' })
await task(projects['CTWS'], 'Dropped idea', { parentId: redesign.id, status: 'cancelled' })
const measure = await task(projects['Moving flat'], '量一下客厅的尺寸', {
  scheduledOn: '2026-10-18',
})
await task(inbox.id, 'Call the letting agent about Hackney')
await task(inbox.id, 'Ask Mira about the payments team')

// ---- meetings --------------------------------------------------------------------------------

// A series with a note on the series, a URL as its place, in a project, with attendees.
const sync = await post('/meetings', {
  title: 'rust-analyzer sync',
  startsLocal: '2026-09-11T10:30',
  timeZone: 'Europe/London',
  durationMinutes: 30,
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
  location: 'https://meet.google.com/abc-defg-hij',
  note: '# Standing agenda\n\n- Open PRs\n- Flaky tests\n',
  projectId: projects['rust-analyzer'],
  attendeeIds: [mary.id, wang.id],
})
// One occurrence moved on its own.
await patch(`/meetings/${sync.meetingId}/occurrences/2026-09-25T10:30`, {
  startsLocal: '2026-09-25T11:00',
})
// A one-off meeting whose place is an address.
const viewing = await post('/meetings', {
  title: 'Flat viewing',
  startsLocal: '2026-10-21T18:00',
  timeZone: 'Europe/London',
  durationMinutes: 45,
  location: 'Flat 3, 12 Mare Street, London E8',
  projectId: projects['Moving flat'],
  attendeeIds: [ouyang.id],
})

// ---- reading ---------------------------------------------------------------------------------

const ddia = await post('/reading', {
  kind: 'book',
  title: 'Designing Data-Intensive Applications',
})
await patch(`/reading/${ddia.id}`, {
  author: 'Martin Kleppmann',
  status: 'reading',
  projectId: projects['Thesis'],
})
const article = await post('/reading', { kind: 'link', url: 'https://example.invalid/payments' })
await patch(`/reading/${article.id}`, { title: 'How Stripe does payments', status: 'todo' })

// ---- links: recommends and about (belongs and attends were made above) -----------------------

const link = (from, to, kind) => post('/links', { from, to, kind })
const T = (id) => ({ type: 'task', id })
const P = (id) => ({ type: 'person', id })
const R = (id) => ({ type: 'reading', id })
const M = (id) => ({ type: 'meeting', id })

await link(P(mary.id), R(ddia.id), 'recommends')
await link(P(wendy.id), R(ddia.id), 'recommends') // a second recommender: only one survives
await link(P(wang.id), R(article.id), 'recommends')
await link(T(amazon.id), P(wendy.id), 'about')
await link(T(measure.id), M(viewing.meetingId), 'about')
await link(R(article.id), T(stripe.id), 'about')
await link(P(cher.id), T(headline.id), 'about')

// ---- v1.5: the cases the acceptance data added -----------------------------------------------

// A parent whose leaves ALL have their own planned day: its day is dropped and reported.
const review = await task(projects['Thesis'], 'Literature review', { scheduledOn: '2026-10-25' })
await task(projects['Thesis'], 'Read the Kleppmann chapters', {
  parentId: review.id,
  scheduledOn: '2026-10-23',
})
await task(projects['Thesis'], 'Summarise the survey papers', {
  parentId: review.id,
  scheduledOn: '2026-10-24',
})

// Two Cambridges: one stored as the bare name (matched by name, the largest one taken), one as
// the full label of the other.
const ada = await person({ name: 'Ada Clarke', city: 'Cambridge', circle: 'work' })
await person({ name: 'Ben Shaw', city: 'Cambridge, Massachusetts, United States', circle: 'work' })

// A place that is text plus a URL: not a whole URL, so it stays a place.
await post('/meetings', {
  title: 'Thesis check-in',
  startsLocal: '2026-10-23T15:00',
  timeZone: 'Europe/London',
  durationMinutes: 30,
  location: 'Zoom: https://zoom.us/j/123456789',
  projectId: projects['Thesis'],
  attendeeIds: [ada.id],
})

// A soft-deleted task and person, each with an edge to it: they become tombstones; the edges
// are counted, not lost.
const abandoned = await task(projects['Moving flat'], 'Compare removal companies')
await link(P(ada.id), T(abandoned.id), 'about')
await call('DELETE', `/tasks/${abandoned.id}`)
const former = await person({ name: 'Former Agent', org: 'Foxtons', circle: 'work' })
await link(T(measure.id), P(former.id), 'about')
await call('DELETE', `/people/${former.id}`)

// A second account, with its own "Stripe": organisations are made per account (FR-090).
cookie = ''
await post('/auth/register', {
  email: 'other@example.com',
  password: opt.password,
  timezone: 'America/Toronto',
})
const otherProject = await post('/projects', { name: 'Side project' })
await person({
  name: 'Nora Diaz',
  org: 'Stripe',
  title: 'Account manager',
  circle: 'work',
  city: 'Toronto, Ontario, Canada',
  projectIds: [otherProject.id],
})
await task(otherProject.id, 'Write the pitch')

console.log(
  JSON.stringify(
    {
      projects,
      people: { ouyang: ouyang.id, mary: mary.id, cher: cher.id, wendy: wendy.id, wang: wang.id },
      tasks: { amazon: amazon.id, stripe: stripe.id, redesign: redesign.id },
      meetings: { sync: sync.meetingId, viewing: viewing.meetingId },
      reading: { ddia: ddia.id, article: article.id },
    },
    null,
    2,
  ),
)
