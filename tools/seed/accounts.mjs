/**
 * The three accounts the API test cases run against (test-plan section 5): Admin, A and B. A gets
 * a small set of everything the new layout holds, B a few things of its own, so a case can show
 * that one account never sees or changes the other's. Runs against the CURRENT version, through
 * its API, so it can only be run on a stack whose registration is open (or empty).
 *
 *   node tools/seed/accounts.mjs --base http://localhost:3300 \
 *     --admin admin@example.com --a a@example.com --b b@example.com --password '<one for all>'
 *
 * The password is given on the command line (or in CTWS_SEED_PASSWORD) and never written down
 * here. The first account registered becomes the instance admin, so Admin goes first. Not
 * idempotent: run it against an empty database.
 */
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3300' },
    admin: { type: 'string', default: 'admin@example.com' },
    a: { type: 'string', default: 'a@example.com' },
    b: { type: 'string', default: 'b@example.com' },
    password: { type: 'string', default: process.env.CTWS_SEED_PASSWORD ?? '' },
    timezone: { type: 'string', default: 'Europe/London' },
  },
})
if (!opt.password) throw new Error('give --password or set CTWS_SEED_PASSWORD')

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
const put = (path, body) => call('PUT', path, body)

async function signUp(email, timezone) {
  cookie = ''
  await post('/auth/register', { email, password: opt.password, timezone })
}

// ---- Admin: the instance's first account, nothing in it --------------------------------------
await signUp(opt.admin, opt.timezone)

// ---- A: a little of everything -----------------------------------------------------------------
await signUp(opt.a, opt.timezone)

const projects = {}
for (const name of ['Job hunt', 'CTWS', 'Moving flat']) {
  projects[name] = (await post('/projects', { name })).id
}
const { stages } = await put(`/projects/${projects['Job hunt']}/stages`, {
  // Rejected folded by default, as the acceptance data has it: a strip at the board's edge.
  stages: [
    { name: 'Applied' },
    { name: 'Phone screen' },
    { name: 'Onsite' },
    { name: 'Rejected', collapsed: true },
  ],
})
const stage = Object.fromEntries(stages.map((s) => [s.name, s.id]))

const { circles } = await put('/people/circles', {
  circles: [{ name: 'Family' }, { name: 'Friends' }, { name: 'Work' }],
})
const circle = Object.fromEntries(circles.map((c) => [c.name, c.id]))

const stripe = await post('/organisations', { name: 'Stripe', type: 'Company' })
const shopify = await post('/organisations', { name: 'Shopify', type: 'Company' })
const harbour = await post('/organisations', { name: 'Harbour & Lane LLP', type: 'Law firm' })

const mira = await post('/people', {
  givenName: 'Mira',
  familyName: 'Chen',
  city: 'London, England, United Kingdom',
  circleIds: [circle.Work],
  projectIds: [projects['Job hunt']],
  channels: [{ kind: 'email', value: 'mira@example.com', label: 'Work' }],
  birthday: { calendar: 'lunar', month: 9, day: 20 },
})
await put(`/people/${mira.id}/roles`, {
  roles: [
    { organisationId: stripe.id, title: 'Staff engineer', from: '2026-03' },
    { organisationId: shopify.id, title: 'Senior engineer', from: '2021-01', to: '2026-02' },
  ],
})
const liwen = await post('/people', {
  name: '李雯',
  aliases: [{ name: 'Wendy Li', label: 'English name' }],
  city: 'Shenzhen, Guangdong, China',
  circleIds: [circle.Friends],
})
const lena = await post('/people', {
  givenName: 'Lena',
  familyName: 'Fischer',
  city: 'Toronto, Ontario, Canada',
  circleIds: [circle.Work],
})
const sarah = await post('/people', {
  givenName: 'Sarah',
  familyName: 'Whitfield',
  circleIds: [circle.Work],
  projectIds: [projects['Moving flat']],
})
await put(`/people/${sarah.id}/roles`, {
  roles: [{ organisationId: harbour.id, title: 'Partner' }],
})
await post('/people', { givenName: 'Tom', familyName: 'Okafor', circleIds: [circle.Family] })

const task = (projectId, title, fields = {}) => post('/tasks', { projectId, title, ...fields })
const amazon = await task(projects['Job hunt'], 'Amazon', { stageId: stage.Onsite })
await task(projects['Job hunt'], 'SDE II, AWS Payments', { parentId: amazon.id })
await task(projects['Job hunt'], 'Prepare the system design round', {
  parentId: amazon.id,
  dueAt: '2026-11-03T18:00:00+00:00',
  notes: `Ask [@Mira Chen](ctws://person/${mira.id}) which questions came up.`,
})
const stripeTask = await task(projects['Job hunt'], 'Stripe', { stageId: stage['Phone screen'] })
await task(projects['Job hunt'], 'Phone screen prep', {
  parentId: stripeTask.id,
  scheduledOn: '2026-10-21',
})
await task(projects['Job hunt'], 'Notion', { stageId: stage.Applied })
await task(projects['Job hunt'], 'Monzo', {
  stageId: stage.Applied,
  dueAt: '2026-10-31T18:00:00+00:00',
})
await task(projects['Job hunt'], 'Datadog', { stageId: stage.Rejected, status: 'cancelled' })
const headline = await task(projects['Job hunt'], 'Update the LinkedIn headline', {
  scheduledOn: '2026-10-22',
})
const flights = await task(projects['Job hunt'], 'Book flights to Seattle')
await put(`/tasks/${flights.id}/dependencies/${headline.id}`)
const redesign = await task(projects['CTWS'], 'Redesign')
await task(projects['CTWS'], 'Tokens', { parentId: redesign.id, status: 'done' })
await task(projects['CTWS'], 'Shell', { parentId: redesign.id, status: 'in_progress' })
await task(projects['Moving flat'], '量一下客厅的尺寸', { scheduledOn: '2026-10-18' })

const sync = await post('/meetings', {
  title: 'rust-analyzer sync',
  startsLocal: '2026-10-09T10:30',
  timeZone: 'Europe/London',
  durationMinutes: 30,
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
  joinUrl: 'https://meet.google.com/abc-defg-hij',
  projectId: projects['CTWS'],
  attendeeIds: [mira.id, lena.id],
})
await post('/notes', {
  title: null,
  body: '## Updates\n\nFlaky tests are down to two.\n\n## Decisions\n\nDrop the nightly run.',
  anchor: { type: 'meeting', id: sync.meetingId, occurrenceId: '2026-10-09T10:30' },
})
await post('/meetings', {
  title: 'Stripe phone screen',
  startsLocal: '2026-10-22T14:00',
  timeZone: 'Europe/London',
  durationMinutes: 45,
  joinUrl: 'https://zoom.us/j/123456789',
  projectId: projects['Job hunt'],
  attendeeIds: [mira.id],
})

// A meeting Mira attended while she was at Shopify (2021 to Feb 2026, as artboard 5 and FR-061
// have it): it stays on Shopify's timeline, and only there, after she moved to Stripe (FR-065).
await post('/meetings', {
  title: 'Payments platform review',
  startsLocal: '2022-05-10T15:00',
  timeZone: 'Europe/London',
  durationMinutes: 60,
  attendeeIds: [mira.id],
})

const ddia = await post('/reading', {
  kind: 'book',
  title: 'Designing Data-Intensive Applications',
})
await patch(`/reading/${ddia.id}`, {
  author: 'Martin Kleppmann',
  status: 'reading',
  projectId: projects['CTWS'],
  recommendedById: mira.id,
})
await post('/reading', { kind: 'link', url: 'https://example.invalid/payments' })

const asked = await post('/communication', {
  direction: 'sent',
  channel: 'email',
  parties: [
    { type: 'organisation', id: harbour.id },
    { type: 'person', id: sarah.id },
  ],
  subject: 'Lease review',
  body: 'Could you look over the lease before Friday?',
  projectId: projects['Moving flat'],
  awaitingReply: true,
  followUpOn: '2026-10-21',
})
await post(`/communication/${asked.id}/reply`, {
  channel: 'email',
  body: 'Yes, send it over.',
  occurredAt: '2026-10-20T09:00:00Z',
})
await post('/communication', {
  direction: 'sent',
  channel: 'message',
  parties: [{ type: 'person', id: liwen.id }],
  body: '周四有空吗？',
  awaitingReply: true,
  followUpOn: '2026-10-28',
})

await post('/notes', { title: 'Ideas', body: 'A note that hangs on nothing.', anchor: null })
await post('/relations', {
  from: { type: 'task', id: amazon.id },
  to: { type: 'organisation', id: stripe.id },
  note: 'Mira works there',
})
await post('/resources', {
  owner: { type: 'project', id: projects['Job hunt'] },
  url: 'https://docs.google.com/document/d/1abc/edit',
  name: 'Interview notes',
})

// ---- B: its own few things, for the cases that must not see A's ---------------------------------
await signUp(opt.b, 'America/Toronto')
const side = await post('/projects', { name: 'Side project' })
const nora = await post('/people', {
  givenName: 'Nora',
  familyName: 'Diaz',
  city: 'Toronto, Ontario, Canada',
  projectIds: [side.id],
})
const bStripe = await post('/organisations', { name: 'Stripe' })
await put(`/people/${nora.id}/roles`, {
  roles: [{ organisationId: bStripe.id, title: 'Account manager' }],
})
await task(side.id, 'Write the pitch')
await post('/meetings', {
  title: 'Pitch rehearsal',
  startsLocal: '2026-10-23T11:00',
  timeZone: 'America/Toronto',
  durationMinutes: 30,
  attendeeIds: [nora.id],
})

console.log(
  JSON.stringify(
    {
      accounts: { admin: opt.admin, a: opt.a, b: opt.b },
      a: {
        projects,
        people: { mira: mira.id, liwen: liwen.id, sarah: sarah.id },
        tasks: { amazon: amazon.id },
      },
      b: { project: side.id, person: nora.id },
    },
    null,
    2,
  ),
)
