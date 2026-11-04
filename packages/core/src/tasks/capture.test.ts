import type { ProjectId } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { parseCapture, type CaptureContext } from './capture'

const ATLAS = '01a1a42a-0000-7000-8000-000000000001' as ProjectId
const ATLAS_WEB = '01a1a42a-0000-7000-8000-000000000002' as ProjectId

// Wednesday, November 4, 2026, in Shanghai (UTC+8), so a deadline's instant shows its zone.
const ctx: CaptureContext = {
  today: '2026-11-04',
  zone: 'Asia/Shanghai',
  projects: [
    { id: ATLAS, name: 'Atlas' },
    { id: ATLAS_WEB, name: 'Atlas web' },
  ],
  ignored: [],
}

/** The words a mark covers, to read the marks at a glance. */
const marked = (text: string, ignored = ctx.ignored) =>
  parseCapture(text, { ...ctx, ignored }).marks.map((m) => [m.kind, text.slice(m.start, m.end)])

describe('parseCapture, as FR-122 accepts it', () => {
  it('reads a plan and a project, and takes them out of the title', () => {
    const text = 'Call Anna tomorrow #Atlas'
    expect(parseCapture(text, ctx)).toMatchObject({
      title: 'Call Anna',
      projectId: ATLAS,
      scheduledOn: '2026-11-05',
      dueAt: null,
      repeat: null,
    })
    expect(marked(text)).toEqual([
      ['scheduled', 'tomorrow'],
      ['project', '#Atlas'],
    ])
  })

  it('reads a deadline with its time, in the account zone, and plans nothing', () => {
    expect(parseCapture('Send invoice due Fri at 4pm', ctx)).toMatchObject({
      title: 'Send invoice',
      scheduledOn: null,
      // Friday Nov 6, 16:00 in Shanghai.
      dueAt: '2026-11-06T08:00:00.000Z',
    })
    expect(marked('Send invoice due Fri at 4pm')).toEqual([['due', 'due Fri at 4pm']])
  })

  it('marks "Monday" in "Monday.com", and leaves the line as typed once it is turned back', () => {
    const text = 'Read about Monday.com'
    expect(marked(text)).toEqual([['scheduled', 'Monday']])
    const at = text.indexOf('Monday')
    expect(parseCapture(text, { ...ctx, ignored: [{ start: at, end: at + 6 }] })).toEqual({
      title: 'Read about Monday.com',
      projectId: null,
      scheduledOn: null,
      dueAt: null,
      repeat: null,
      marks: [],
    })
  })

  it('reads a repeat, and plans it for the first day it falls on', () => {
    expect(parseCapture('Pay rent every month on the 1st', ctx)).toMatchObject({
      title: 'Pay rent',
      repeat: { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
      scheduledOn: '2026-12-01',
    })
  })

  it('leaves a # name that is no project as words, into the inbox', () => {
    expect(parseCapture('#Foo bar', ctx)).toMatchObject({
      title: '#Foo bar',
      projectId: null,
      marks: [],
    })
  })
})

describe('days', () => {
  it.each([
    ['today', '2026-11-04'],
    ['tomorrow', '2026-11-05'],
    ['next week', '2026-11-09'],
    ['fri', '2026-11-06'],
    ['Friday', '2026-11-06'],
    ['thurs', '2026-11-05'],
    ['Nov 12', '2026-11-12'],
    ['12 Nov', '2026-11-12'],
    ['Nov 12th', '2026-11-12'],
    ['2026-11-12', '2026-11-12'],
    // A month and day gone by this year is next year's.
    ['Mar 3', '2027-03-03'],
  ])('reads "Do it %s" as planned for %s', (words, day) => {
    expect(parseCapture(`Do it ${words}`, ctx)).toMatchObject({ title: 'Do it', scheduledOn: day })
  })

  it.each(['Do it 11/12', 'Do it 12.11', 'Eat a lemon', 'Monday2'])(
    'reads no day in "%s"',
    (text) => {
      expect(parseCapture(text, ctx)).toMatchObject({ title: text, scheduledOn: null, marks: [] })
    },
  )

  it('reads only the last of two plans; the first stays a word of the title', () => {
    const text = 'Move Monday meeting to Friday'
    expect(parseCapture(text, ctx)).toMatchObject({
      title: 'Move Monday meeting to',
      scheduledOn: '2026-11-06',
    })
    expect(marked(text)).toEqual([['scheduled', 'Friday']])
  })

  it('is read whatever the case', () => {
    expect(parseCapture('Ship TOMORROW', ctx)).toMatchObject({ scheduledOn: '2026-11-05' })
  })
})

describe('deadlines', () => {
  it.each([
    ['by Nov 12', '2026-11-12T15:59:00.000Z'],
    ['due tomorrow', '2026-11-05T15:59:00.000Z'],
    ['due Fri at 16:00', '2026-11-06T08:00:00.000Z'],
    ['due Fri at 9am', '2026-11-06T01:00:00.000Z'],
    ['due Fri at 12am', '2026-11-05T16:00:00.000Z'],
    ['due Fri at 12pm', '2026-11-06T04:00:00.000Z'],
    ['due Fri at 4:30 pm', '2026-11-06T08:30:00.000Z'],
  ])('reads "%s" as due at %s, 23:59 there when no time is given', (words, at) => {
    expect(parseCapture(`File it ${words}`, ctx)).toMatchObject({ title: 'File it', dueAt: at })
  })

  it('takes a plan and a deadline together', () => {
    expect(parseCapture('Draft tomorrow due Fri', ctx)).toMatchObject({
      title: 'Draft',
      scheduledOn: '2026-11-05',
      dueAt: '2026-11-06T15:59:00.000Z',
    })
  })

  it('does not read a time that is no time; the day is still read as a plan', () => {
    expect(parseCapture('Call due Fri at 25:00', ctx)).toMatchObject({
      dueAt: null,
      scheduledOn: '2026-11-06',
    })
  })
})

describe('repeats', () => {
  it.each([
    ['every day', { kind: 'rule', rule: 'FREQ=DAILY' }],
    ['every Monday', { kind: 'rule', rule: 'FREQ=WEEKLY;BYDAY=MO' }],
    ['every other Tuesday', { kind: 'rule', rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU' }],
    ['every 2 weeks', { kind: 'rule', rule: 'FREQ=WEEKLY;INTERVAL=2' }],
    ['every month on the 9th', { kind: 'rule', rule: 'FREQ=MONTHLY;BYMONTHDAY=9' }],
    ['every year on Nov 9', { kind: 'rule', rule: 'FREQ=YEARLY;BYMONTH=11;BYMONTHDAY=9' }],
    ['every 3 days after done', { kind: 'after', every: 3, unit: 'day' }],
    ['every 2 weeks after done', { kind: 'after', every: 2, unit: 'week' }],
    ['every month after done', { kind: 'after', every: 1, unit: 'month' }],
  ])('reads "%s"', (words, repeat) => {
    expect(parseCapture(`Water the plants ${words}`, ctx)).toMatchObject({
      title: 'Water the plants',
      repeat,
    })
  })

  it('plans a weekly one for its next day, today included', () => {
    expect(parseCapture('Report every Wednesday', ctx).scheduledOn).toBe('2026-11-04')
    expect(parseCapture('Report every Monday', ctx).scheduledOn).toBe('2026-11-09')
  })

  it('plans one counted from done for today', () => {
    expect(parseCapture('Water every 3 days after done', ctx).scheduledOn).toBe('2026-11-04')
  })

  it('keeps a plan or a deadline given beside it, and adds no plan to a deadline alone', () => {
    expect(parseCapture('Rent every month on the 1st tomorrow', ctx)).toMatchObject({
      scheduledOn: '2026-11-05',
    })
    expect(parseCapture('Rent every month on the 1st due Fri', ctx)).toMatchObject({
      scheduledOn: null,
      dueAt: '2026-11-06T15:59:00.000Z',
    })
  })

  it('does not read the weekday of a repeat as a plan too', () => {
    expect(marked('Gym every Monday')).toEqual([['repeat', 'every Monday']])
  })

  it.each([
    'every year after done',
    'every 3 Mondays',
    'every week on the 3rd',
    'every month on the 40th',
  ])('reads nothing sensible in "%s"', (words) => {
    expect(parseCapture(`Do ${words}`, ctx).repeat).toBeNull()
  })
})

describe('projects', () => {
  it('takes the longest project name that fits, spaces and all, whatever the case', () => {
    expect(parseCapture('Fix the header #atlas web', ctx)).toMatchObject({
      title: 'Fix the header',
      projectId: ATLAS_WEB,
    })
    expect(parseCapture('Fix the header #Atlas', ctx).projectId).toBe(ATLAS)
  })

  it('does not take a name that runs on into another word', () => {
    expect(parseCapture('See #Atlases', ctx)).toMatchObject({
      projectId: null,
      title: 'See #Atlases',
    })
  })

  it('takes the last of two projects', () => {
    expect(parseCapture('#Atlas or #Atlas web', ctx)).toMatchObject({
      projectId: ATLAS_WEB,
      title: '#Atlas or',
    })
  })
})

describe('marks', () => {
  it('count UTF-16 units, as an input value does', () => {
    const text = '给 👩‍💻 打电话 tomorrow'
    const [mark] = parseCapture(text, ctx).marks
    expect(text.slice(mark!.start, mark!.end)).toBe('tomorrow')
  })

  it('read nothing that overlaps a stretch turned back', () => {
    const text = 'Pay due Fri'
    const at = text.indexOf('Fri')
    expect(parseCapture(text, { ...ctx, ignored: [{ start: at, end: at + 1 }] })).toMatchObject({
      title: 'Pay due Fri',
      dueAt: null,
      scheduledOn: null,
    })
  })
})
