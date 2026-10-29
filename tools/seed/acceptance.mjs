/**
 * The acceptance data set (docs/product/2026-10-redesign/acceptance-data.md): the states the
 * artboards show and the ones a tidy seed hides. Three accounts:
 *   typical  as the artboards have it, to hold each block against its artboard;
 *   many     every place past five rows, for FR-015;
 *   empty    a new account, for FR-030.
 * Runs through the API of the CURRENT version, on a stack whose clock is pinned at the
 * acceptance "now", 2026-10-22 09:10 in London (`CLOCK_PINNED_AT=2026-10-22T08:10:00Z`): what
 * the server stamps (made, done, started) is that day. Not idempotent: an empty database.
 *
 *   node tools/seed/acceptance.mjs --base http://localhost:3303 --password '<one for all>' \
 *     [--typical typical@example.com] [--many many@example.com] [--empty empty@example.com]
 *
 * History the server stamps with its own clock (the review's earlier weeks, a project quiet for
 * nine days) is written first, a day at a time, with the clock pinned at each day of `HISTORY`
 * and `--history <day>`; then the run above, at 2026-10-22, adds the rest to the same account.
 *
 *   for each day in HISTORY: pin CLOCK_PINNED_AT to <day>T09:00:00Z, recreate the API, then
 *   node tools/seed/acceptance.mjs --base ... --history <day>
 *
 * The password is given on the command line (or in CTWS_SEED_PASSWORD) and never written down
 * here.
 */
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:3303' },
    typical: { type: 'string', default: 'typical@example.com' },
    many: { type: 'string', default: 'many@example.com' },
    empty: { type: 'string', default: 'empty@example.com' },
    password: { type: 'string', default: process.env.CTWS_SEED_PASSWORD ?? '' },
    history: { type: 'string' },
  },
})
if (!opt.password) throw new Error('give --password or set CTWS_SEED_PASSWORD')

const ZONE = 'Europe/London'
const WEB = { 'x-ctws-client': 'web' }
let cookie = ''

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function call(method, path, body) {
  for (;;) {
    const res = await fetch(`${opt.base}/api/v1${path}`, {
      method,
      headers: {
        ...WEB,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    // Adding reading is limited per minute: wait it out rather than leave the pile short.
    if (res.status === 429) {
      await pause(5000)
      continue
    }
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const text = await res.text()
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
    return text ? JSON.parse(text) : null
  }
}
const post = (path, body) => call('POST', path, body)
const patch = (path, body) => call('PATCH', path, body)
const put = (path, body) => call('PUT', path, body)

async function signUp(email) {
  cookie = ''
  await post('/auth/register', { email, password: opt.password, timezone: ZONE })
}

/** Into an account the history made, or a new one when there was none. */
async function signIn(email) {
  cookie = ''
  try {
    await post('/auth/login', { email, password: opt.password })
  } catch {
    await signUp(email)
  }
}

/** A project by its name, made when it is not there yet. */
async function project(name, color) {
  const found = (await call('GET', '/projects?archived=false')).projects.find(
    (p) => p.name === name,
  )
  return found ? found.id : (await post('/projects', { name, color })).id
}

/**
 * A task, made as a person makes one: as to do, then moved on. Made already done, it was never
 * finished in any week, and the review counts what was finished, started and dropped.
 */
async function task(projectId, title, { status, ...fields } = {}) {
  const made = await post('/tasks', { projectId, title, ...fields })
  if (status && status !== 'todo') await patch(`/tasks/${made.id}`, { status })
  return made
}
const at = (day, clock = '18:00') => `${day}T${clock}:00+01:00`

/** A book or a link, then its fields: a new one is "to read". */
async function reading(title, fields = {}) {
  const item = await post('/reading', { kind: 'book', title })
  if (Object.keys(fields).length > 0) await patch(`/reading/${item.id}`, fields)
  return item
}

// ======================================================================= typical: history
/**
 * What happened before the acceptance "now", by the day it happened on (the clock pinned there):
 * the review's weeks, finished counts newest first 25, 14, 8, 10, 6, 9 (acceptance-data.md), and
 * Moving flat, last touched on the 13th, nine days quiet by the 22nd.
 */
const HISTORY = {
  '2026-09-09': { done: 9 },
  '2026-09-16': { done: 6 },
  '2026-09-23': { done: 10 },
  '2026-09-30': { done: 8 },
  '2026-10-07': { done: 14 },
  '2026-10-13': { done: 25, dropped: 2, movingFlat: true },
}
if (opt.history) {
  const step = HISTORY[opt.history]
  if (!step) throw new Error(`no history on ${opt.history}; the days are ${Object.keys(HISTORY)}`)
  await signIn(opt.typical)
  const ctws = await project('CTWS', 'blue')
  const earlier = (await call('GET', `/tasks?projectId=${ctws}`)).tasks.find(
    (t) => t.title === 'Earlier work' && t.parentId === null,
  )
  const parent = earlier ? earlier.id : (await task(ctws, 'Earlier work')).id
  for (let i = 1; i <= step.done; i++)
    await task(ctws, `Finished in the week of ${opt.history} (${i})`, {
      parentId: parent,
      status: 'done',
    })
  for (let i = 1; i <= (step.dropped ?? 0); i++)
    await task(ctws, `Dropped in the week of ${opt.history} (${i})`, {
      parentId: parent,
      status: 'cancelled',
    })
  if (step.movingFlat) {
    const flat = await project('Moving flat', 'violet')
    await task(flat, 'Call the removal company')
    await task(flat, 'Pack the books')
    await task(flat, 'Measure the living room')
  }
  console.log(`history of ${opt.history} written`)
  process.exit(0)
}

// =============================================================================== typical
await signIn(opt.typical)

// ---- projects ---------------------------------------------------------------------------------
const P = {}
for (const [name, color] of [
  ['CTWS', 'blue'],
  ['Job hunt', 'amber'],
  ['rust-analyzer', 'green'],
  ['Moving flat', 'violet'],
  ['Find a lawyer', 'red'],
  ['Atlas', 'teal'],
  ['Thesis', 'pink'],
  ['Old blog', 'olive'],
  ['Kitchen 2025', 'amber'],
]) {
  P[name] = await project(name, color)
}
await patch(`/projects/${P['Old blog']}`, { archived: true })
await patch(`/projects/${P['Kitchen 2025']}`, { archived: true })
const inbox = (await call('GET', '/projects')).projects.find((p) => p.isInbox)
for (const title of [
  'Renew the passport',
  'Look at the gym near work',
  'Reply to the school newsletter',
  'Book the dentist',
  'Check the bike tyres',
  'Read the lease again',
  'Return the jacket',
  'Ask about the conference ticket',
  'Back up the photos',
]) {
  await task(inbox.id, title)
}

// ---- circles, organisations, people ---------------------------------------------------------------
const { circles } = await put('/people/circles', {
  circles: ['Family', 'Friends', 'Work', 'University', 'Climbing'].map((name) => ({ name })),
})
const circle = Object.fromEntries(circles.map((c) => [c.name, c.id]))

const O = {}
for (const [name, type] of [
  ['Stripe', 'Company'],
  ['Shopify', 'Company'],
  ['Amazon', 'Company'],
  ['Notion', 'Company'],
  ['Monzo', 'Company'],
  ['GitLab', 'Company'],
  ['Datadog', 'Company'],
  ['Tencent', 'Company'],
  ['ByteDance', 'Company'],
  ['Northwind', 'Company'],
  ['Kestrel Labs', 'Company'],
  ['Figma', 'Company'],
  ['Wise', 'Company'],
  ['Revolut', 'Company'],
  ['Deliveroo', 'Company'],
  ['Ocado', 'Company'],
  ['Harbour & Lane LLP', 'Law firm'],
  ['Morrow Legal', 'Law firm'],
  ['Clifford Rowe', 'Law firm'],
  ['Imperial College London', 'School'],
  ['Tsinghua University', 'School'],
  ['The Climbing Hangar', 'Other'],
  ['Shoreditch Library', 'Other'],
]) {
  O[name] = (await post('/organisations', { name, type })).id
}

const person = (fields) => post('/people', fields)
const roles = (id, list) => put(`/people/${id}/roles`, { roles: list })

const mira = await person({
  givenName: 'Mira',
  familyName: 'Chen',
  city: 'London, England, United Kingdom',
  circleIds: [circle.Work],
  projectIds: [P['Job hunt']],
  channels: [{ kind: 'email', value: 'mira@example.com', label: 'Work' }],
  birthday: { calendar: 'lunar', month: 9, day: 20 },
})
await roles(mira.id, [
  { organisationId: O.Stripe, title: 'Staff engineer', from: '2026-03' },
  { organisationId: O.Shopify, title: 'Senior engineer', from: '2021-01', to: '2026-02' },
])
const liwen = await person({
  name: '李雯',
  aliases: [{ name: 'Wendy Li', label: 'English name' }],
  city: 'Shenzhen, Guangdong, China',
  circleIds: [circle.Friends, circle.University],
})
await roles(liwen.id, [
  { organisationId: O.Tencent, title: 'Product manager', from: '2023-07' },
  { organisationId: O.Tencent, title: 'Graduate mentor', from: '2024-09' },
  { organisationId: O.ByteDance, title: 'Product analyst', from: '2020-07', to: '2023-06' },
])
const priya = await person({
  givenName: 'Priya',
  familyName: 'Nair',
  city: 'London, England, United Kingdom',
  circleIds: [circle.Work],
  channels: [{ kind: 'email', value: 'priya@example.com' }],
})
const tom = await person({
  givenName: 'Tom',
  familyName: 'Okafor',
  circleIds: [circle.Family],
  birthday: { calendar: 'solar', month: 3, day: 14 },
})
const wanglei = await person({
  name: '王磊',
  city: 'Shanghai, China',
  circleIds: [circle.University],
  // A number to call, so a phone's Call opens the dialler (FR-087).
  channels: [{ kind: 'phone', value: '+86 139 1234 5678' }],
})
const lena = await person({
  givenName: 'Lena',
  familyName: 'Fischer',
  city: 'Toronto, Ontario, Canada',
  circleIds: [circle.Work],
})
const sarah = await person({
  givenName: 'Sarah',
  familyName: 'Whitfield',
  circleIds: [circle.Work],
  projectIds: [P['Find a lawyer']],
})
await roles(sarah.id, [{ organisationId: O['Harbour & Lane LLP'], title: 'Partner' }])
const daniel = await person({
  givenName: 'Daniel',
  familyName: 'Hart',
  projectIds: [P['Find a lawyer']],
})
await roles(daniel.id, [{ organisationId: O['Harbour & Lane LLP'], title: 'Associate' }])
await person({ name: '陈思远', circleIds: [circle.Friends] })
const rao = await person({ givenName: 'Prisha', familyName: 'Rao', circleIds: [circle.Climbing] })
const ward = await person({ givenName: 'James', familyName: 'Ward', circleIds: [circle.Work] })

// The rest of the 48, so the sidebar and the circles read as a life, not a sample.
const FIRST = ['Alex', 'Ben', 'Chloe', 'Dev', 'Elif', 'Femi', 'Grace', 'Hiro', 'Isla', 'Jonas']
const LAST = ['Adams', 'Byrne', 'Costa', 'Doyle', 'Evans', 'Ford', 'Gill', 'Hale', 'Ito', 'Jain']
const CIRCLE_ORDER = [
  'Family',
  'Friends',
  'Friends',
  'Work',
  'Work',
  'Work',
  'University',
  'Climbing',
]
const atlasPeople = []
for (let i = 0; i < 37; i++) {
  const p = await person({
    givenName: FIRST[i % FIRST.length],
    familyName: LAST[(i * 3 + Math.floor(i / 10)) % LAST.length],
    circleIds: [circle[CIRCLE_ORDER[i % CIRCLE_ORDER.length]]],
  })
  // Fifteen of them meet weekly on Atlas: eight from Northwind, four from Kestrel Labs.
  if (i < 15) {
    atlasPeople.push(p.id)
    if (i < 8) await roles(p.id, [{ organisationId: O.Northwind, title: 'Engineer' }])
    else if (i < 12) await roles(p.id, [{ organisationId: O['Kestrel Labs'], title: 'Designer' }])
  }
}

// ---- Job hunt: companies are parents, at a stage ----------------------------------------------
const { stages } = await put(`/projects/${P['Job hunt']}/stages`, {
  stages: [
    { name: 'Applied' },
    { name: 'Phone screen' },
    { name: 'Onsite' },
    { name: 'Rejected', collapsed: true },
  ],
})
const stage = Object.fromEntries(stages.map((s) => [s.name, s.id]))
const JH = P['Job hunt']
for (const [company, fields] of [
  ['Notion', {}],
  ['Monzo', { dueAt: at('2026-10-31') }],
  ['GitLab', {}],
  ['Datadog', {}],
  ['Figma', {}],
  ['Wise', {}],
  ['Revolut', {}],
  ['Deliveroo', {}],
  ['Ocado', {}],
]) {
  const parent = await task(JH, company, { stageId: stage.Applied, ...fields })
  await task(JH, 'Send the application', { parentId: parent.id, status: 'done' })
  await task(JH, 'Follow up with the recruiter', { parentId: parent.id })
}
const stripeTask = await task(JH, 'Stripe', { stageId: stage['Phone screen'] })
await task(JH, 'Phone screen prep', {
  parentId: stripeTask.id,
  dueAt: at('2026-10-23', '12:00'),
})
await task(JH, 'Read the payments API docs', { parentId: stripeTask.id, status: 'done' })
const shopifyTask = await task(JH, 'Shopify', { stageId: stage['Phone screen'] })
await task(JH, 'Book the call', { parentId: shopifyTask.id })
const amazon = await task(JH, 'Amazon')
const sde = await task(JH, 'SDE II, AWS Payments', { parentId: amazon.id, stageId: stage.Onsite })
const prepare = await task(JH, 'Prepare the system design round', {
  parentId: sde.id,
  status: 'in_progress',
  notes: `Ask [@Mira Chen](ctws://person/${mira.id}) which questions came up.`,
})
const flights = await task(JH, 'Book flights to Seattle', { parentId: sde.id })
await put(`/tasks/${flights.id}/dependencies/${prepare.id}`)
for (const company of ['Airbnb', 'Spotify', 'Meta', 'Uber']) {
  const parent = await task(JH, company, { stageId: stage.Rejected })
  await task(JH, 'Send the application', { parentId: parent.id, status: 'done' })
  await task(JH, 'Interview', { parentId: parent.id, status: 'cancelled' })
}
await task(JH, 'Update the LinkedIn headline', { scheduledOn: '2026-10-22' })
await post('/relations', {
  from: { type: 'task', id: amazon.id },
  to: { type: 'organisation', id: O.Amazon },
})
await post('/relations', {
  from: { type: 'task', id: stripeTask.id },
  to: { type: 'organisation', id: O.Stripe },
})

// ---- CTWS: three parents and a busy week -------------------------------------------------------
const CT = P.CTWS
const ctParents = {}
for (const name of ['Redesign', 'Backend performance', 'Bugs from the review']) {
  ctParents[name] = (await task(CT, name)).id
}
const spread = (counts) =>
  Object.entries(counts).flatMap(([status, n]) =>
    Array.from({ length: n }, (_, i) => ({ status, i })),
  )
const plan = {
  Redesign: { todo: 11, in_progress: 1, backlog: 13, cancelled: 2, done: 8 },
  'Backend performance': { todo: 10, in_progress: 1, backlog: 12, cancelled: 1, done: 6 },
  'Bugs from the review': { todo: 10, in_progress: 1, backlog: 12, cancelled: 1, done: 8 },
}
const WORDS = {
  Redesign: ['Tokens', 'Shell', 'Inspector', 'Search', 'Calendar', 'Review', 'Account', 'Phone'],
  'Backend performance': ['Index the events', 'Batch the links', 'Cache the counts', 'Profile'],
  'Bugs from the review': ['Focus after delete', 'Overdue chip', 'Birthday year', 'Board scroll'],
}
let firstInProgress = true
for (const [name, counts] of Object.entries(plan)) {
  // Numbered across the parent, not within each status: no two tasks share a name.
  for (const [i, { status }] of spread(counts).entries()) {
    const word = WORDS[name][i % WORDS[name].length]
    const fields = { parentId: ctParents[name], status }
    // One under way is due at six today.
    if (status === 'in_progress' && firstInProgress) {
      fields.dueAt = at('2026-10-22')
      firstInProgress = false
    }
    await task(CT, `${word}${i >= WORDS[name].length ? ` (${i + 1})` : ''}`, fields)
  }
}
for (const title of ['Write the changelog', 'Tag the release', 'Archive the old docs']) {
  await task(CT, title, { status: 'done' })
}
const pr = await task(CT, 'Review the search pull request', {
  parentId: ctParents.Redesign,
  status: 'in_progress',
})
await post('/resources', {
  owner: { type: 'task', id: pr.id },
  url: 'https://github.com/example/ctws/pull/412',
  name: null,
})

// ---- Today: planned, carried over, overdue ----------------------------------------------------
// Moving flat is left alone today: its history says nine days quiet.
await task(P.Atlas, 'Book the room for the Atlas demo', { scheduledOn: '2026-10-22' })
// A parent planned for today: its progress and "0/2" where a leaf has its status (T-04).
const demo = await task(P.Atlas, 'Prepare the Atlas demo', { scheduledOn: '2026-10-22' })
await task(P.Atlas, 'Record the walkthrough', { parentId: demo.id })
await task(P.Atlas, 'Send the agenda', { parentId: demo.id })
await task(P.Thesis, 'Email the supervisor', { scheduledOn: '2026-10-18' })
await task(P['Find a lawyer'], 'Send the lease to Harbour & Lane', { dueAt: at('2026-10-15') })
await task(P.Thesis, 'Draft the related-work section', { dueAt: at('2026-10-20') })
await task(P.Thesis, 'Fix the figure numbering', {})
await task(P['rust-analyzer'], 'Look at the flaky test', {})
await task(P.Atlas, 'Read the Northwind brief', {})

// ---- resources -------------------------------------------------------------------------------
const pin = async (projectId, list) => {
  let rank = 1
  for (const [url, name] of list) {
    const r = await post('/resources', { owner: { type: 'project', id: projectId }, url, name })
    await patch(`/resources/${r.id}`, { pinnedRank: rank++ })
  }
}
await pin(JH, [
  ['https://drive.google.com/drive/folders/1jobhunt', 'Applications'],
  ['https://docs.google.com/document/d/1cv/edit', 'CV'],
  ['https://www.overleaf.com/project/abc123', 'Cover letter'],
  ['https://www.levels.fyi/', 'Salaries'],
])
await pin(CT, [
  ['https://github.com/example/ctws', 'Repository'],
  ['https://www.figma.com/file/abc/redesign', 'Artboards'],
  ['https://docs.google.com/document/d/1spec/edit', 'Spec'],
])

// ---- meetings --------------------------------------------------------------------------------
const sync = await post('/meetings', {
  title: 'rust-analyzer sync',
  startsLocal: '2026-09-11T10:30',
  timeZone: ZONE,
  durationMinutes: 30,
  rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=FR',
  joinUrl: 'https://meet.google.com/abc-defg-hij',
  projectId: P['rust-analyzer'],
  attendeeIds: [mira.id, lena.id],
})
for (const [occurrenceId, body] of [
  ['2026-09-25T10:30', '## Updates\n\nThe proc-macro server crashes less.'],
  [
    '2026-10-09T10:30',
    '## Updates\n\nFlaky tests are down to two.\n\n## Decisions\n\nDrop the nightly run.',
  ],
]) {
  await post('/notes', {
    title: null,
    body,
    anchor: { type: 'meeting', id: sync.meetingId, occurrenceId },
  })
}
const atlas = await post('/meetings', {
  title: 'Atlas weekly',
  startsLocal: '2026-08-17T09:00',
  timeZone: ZONE,
  durationMinutes: 45,
  rrule: 'FREQ=WEEKLY;BYDAY=MO',
  location: 'Northwind, 3rd floor',
  projectId: P.Atlas,
  attendeeIds: atlasPeople,
})
const LONG = [
  '## Updates',
  ...Array.from(
    { length: 6 },
    (_, i) =>
      `- Team ${i + 1} shipped what it planned, with one thing carried over to next week because the review came late.`,
  ),
  '## Decisions',
  ...Array.from(
    { length: 4 },
    (_, i) =>
      `- Decision ${i + 1}: keep the release on Thursday and move the migration to the week after, so support is ready.`,
  ),
  '## Risks',
  ...Array.from(
    { length: 4 },
    (_, i) =>
      `- Risk ${i + 1}: the vendor contract is not signed yet, and the data export may take longer than the estimate.`,
  ),
  '## Actions',
  ...Array.from(
    { length: 6 },
    (_, i) => `- Action ${i + 1}: write up the plan and share it in the channel before Wednesday.`,
  ),
].join('\n\n')
await post('/notes', {
  title: null,
  body: LONG,
  anchor: { type: 'meeting', id: atlas.meetingId, occurrenceId: '2026-10-19T09:00' },
})
await post('/meetings', {
  title: 'Stripe: first screen',
  startsLocal: '2026-10-22T14:00',
  timeZone: ZONE,
  durationMinutes: 45,
  joinUrl: 'https://zoom.us/j/123456789',
  projectId: JH,
  attendeeIds: [mira.id, priya.id],
})
await post('/meetings', {
  title: 'Harbour & Lane intro',
  startsLocal: '2026-10-16T11:00',
  timeZone: ZONE,
  durationMinutes: 30,
  location: '12 Fetter Lane, London',
  projectId: P['Find a lawyer'],
  attendeeIds: [sarah.id],
})
await post('/meetings', {
  title: 'Coffee with Priya',
  startsLocal: '2026-10-20T08:30',
  timeZone: ZONE,
  durationMinutes: 30,
  attendeeIds: [priya.id],
})
await post('/meetings', {
  title: 'Payments platform review',
  startsLocal: '2022-05-10T15:00',
  timeZone: ZONE,
  durationMinutes: 60,
  attendeeIds: [mira.id],
})

// ---- communication ---------------------------------------------------------------------------
const message = (fields) => post('/communication', { channel: 'email', ...fields })
await message({
  direction: 'sent',
  parties: [{ type: 'person', id: priya.id }],
  subject: 'Referral for the Stripe role',
  body: 'Thanks again. Could you pass my CV on?',
  occurredAt: '2026-10-14T10:00:00Z',
  projectId: JH,
  awaitingReply: true,
  followUpOn: '2026-10-21',
})
await message({
  direction: 'sent',
  parties: [{ type: 'organisation', id: O['Morrow Legal'] }],
  subject: 'Enquiry: review of a lease',
  body: 'Would you be able to look at a residential lease this month?',
  occurredAt: '2026-10-13T09:00:00Z',
  projectId: P['Find a lawyer'],
  awaitingReply: true,
  followUpOn: '2026-10-23',
})
await message({
  direction: 'sent',
  channel: 'message',
  parties: [{ type: 'person', id: liwen.id }],
  body: '周四有空吗？',
  occurredAt: '2026-10-20T12:00:00Z',
  awaitingReply: true,
  followUpOn: '2026-10-28',
})
const clifford = await message({
  direction: 'sent',
  parties: [{ type: 'organisation', id: O['Clifford Rowe'] }],
  subject: 'Enquiry: review of a lease',
  occurredAt: '2026-10-08T09:00:00Z',
  projectId: P['Find a lawyer'],
  awaitingReply: true,
})
await post(`/communication/${clifford.id}/reply`, {
  body: 'Thank you for your enquiry. We are not taking new clients at the moment.',
  occurredAt: '2026-10-10T15:00:00Z',
})
const lease = await message({
  direction: 'sent',
  parties: [
    { type: 'organisation', id: O['Harbour & Lane LLP'] },
    { type: 'person', id: sarah.id },
  ],
  subject: 'Lease review',
  body: 'Could you look over the lease before Friday?',
  occurredAt: '2026-10-12T09:00:00Z',
  projectId: P['Find a lawyer'],
  awaitingReply: true,
})
await post(`/communication/${lease.id}/reply`, {
  body: 'Yes, send it over.',
  occurredAt: '2026-10-13T09:00:00Z',
})
await message({
  direction: 'received',
  channel: 'call',
  parties: [{ type: 'person', id: mira.id }],
  subject: 'What the onsite is like',
  occurredAt: '2026-10-19T17:00:00Z',
  projectId: JH,
})

// Two not heard from for a while: four months and seven.
await message({
  direction: 'sent',
  parties: [{ type: 'person', id: ward.id }],
  subject: 'Drinks after the conference?',
  occurredAt: '2026-06-18T18:00:00Z',
})
await message({
  direction: 'received',
  channel: 'message',
  parties: [{ type: 'person', id: rao.id }],
  body: 'Climbing on Sunday?',
  occurredAt: '2026-03-20T09:00:00Z',
})

// ---- reading ---------------------------------------------------------------------------------
await reading('Designing Data-Intensive Applications', {
  author: 'Martin Kleppmann',
  status: 'reading',
  recommendedById: mira.id,
})
await reading('Crafting Interpreters', {
  author: 'Robert Nystrom',
  status: 'reading',
  projectId: P['rust-analyzer'],
})
await reading('Staff Engineer', { author: 'Will Larson', recommendedById: mira.id })
for (const title of [
  'The Pragmatic Programmer',
  'A Philosophy of Software Design',
  'Thinking in Systems',
  'The Manager’s Path',
  'Working in Public',
  'An Elegant Puzzle',
  'Accelerate',
  'Team Topologies',
  'Database Internals',
  'Programming Rust',
  'The Mythical Man-Month',
]) {
  await reading(title)
}
for (let i = 1; i <= 34; i++) await reading(`Finished book ${i}`, { status: 'done' })
for (let i = 1; i <= 3; i++) await reading(`Dropped book ${i}`, { status: 'dropped' })

// ---- notes -----------------------------------------------------------------------------------
await post('/notes', { title: 'Ideas', body: 'A note that hangs on nothing.', anchor: null })
await post('/notes', {
  title: 'Questions for the onsite',
  body: `## For the team\n\n- How on-call works\n- What the first project would be\n\nAsk [@Mira Chen](ctws://person/${mira.id}) too.`,
  anchor: { type: 'project', id: JH },
})

// =============================================================================== many
await signUp(opt.many)
const M = (await post('/projects', { name: 'Everything', color: 'blue' })).id
const big = await task(M, 'A parent with a long tail')
for (let i = 1; i <= 30; i++)
  await task(M, `Closed leaf ${i}`, { parentId: big.id, status: 'done' })
let deep = big.id
for (const level of ['Level 2', 'Level 3', 'Level 4'])
  deep = (await task(M, level, { parentId: deep })).id
for (let i = 1; i <= 12; i++)
  await task(M, `Overdue ${i}`, { dueAt: at(`2026-10-${String(21 - i).padStart(2, '0')}`) })
for (let i = 1; i <= 8; i++) await task(M, `Under way ${i}`, { status: 'in_progress' })
for (let i = 1; i <= 16; i++) await task(M, `Ready ${i}`)
for (let i = 1; i <= 8; i++) {
  await post('/meetings', {
    title: `Call ${i}`,
    startsLocal: `2026-10-22T${String(8 + i).padStart(2, '0')}:00`,
    timeZone: ZONE,
    durationMinutes: 30,
  })
}
const nine = []
for (let i = 1; i <= 9; i++) nine.push((await post('/projects', { name: `Project ${i}` })).id)
const busy = await person({ givenName: 'Morgan', familyName: 'Lee', projectIds: nine })
for (let i = 1; i <= 20; i++) {
  await post('/meetings', {
    title: `1:1 ${i}`,
    startsLocal: `2026-${i <= 10 ? '10' : '11'}-${String(((i - 1) % 10) + 2).padStart(2, '0')}T16:00`,
    timeZone: ZONE,
    durationMinutes: 30,
    attendeeIds: [busy.id],
  })
}
const busyOrg = (await post('/organisations', { name: 'Acme', type: 'Company' })).id
for (let i = 1; i <= 40; i++) {
  await message({
    direction: i % 2 ? 'sent' : 'received',
    parties: [
      { type: 'organisation', id: busyOrg },
      { type: 'person', id: busy.id },
    ],
    subject: `Thread ${i}`,
    // Every other day from August to the 20th of October: the latest within the 30 days that
    // Organisations in touch looks back (FR-071).
    occurredAt: new Date(Date.UTC(2026, 7, 1 + i * 2, 10)).toISOString(),
    ...(i % 2 && i > 10
      ? { awaitingReply: true, followUpOn: `2026-10-${String(10 + (i % 20)).padStart(2, '0')}` }
      : {}),
  })
}
for (let i = 1; i <= 200; i++) {
  await person({
    givenName: FIRST[i % FIRST.length],
    familyName: `${LAST[i % LAST.length]}-${String.fromCharCode(65 + (i % 26))}`,
  })
}

// =============================================================================== empty
await signUp(opt.empty)

console.log(
  JSON.stringify(
    {
      accounts: { typical: opt.typical, many: opt.many, empty: opt.empty },
      typical: {
        projects: P,
        people: { mira: mira.id, liwen: liwen.id, tom: tom.id, wanglei: wanglei.id },
      },
      history: Object.keys(HISTORY),
    },
    null,
    2,
  ),
)
