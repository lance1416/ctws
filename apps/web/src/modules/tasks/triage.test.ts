import { describe, expect, it } from 'vitest'
import { triageSections, type TriagePatch } from './triage'

// What each decision writes: one touching two fields sends both; a moved deadline keeps its time.
const TODAY = '2026-10-10' // a Saturday
const ZONE = 'America/Toronto'

const sectionsFor = (
  t: { id: string; segment: 'overdue' | 'today' | 'in_progress'; dueAt: string | null },
  carried: boolean,
  record: (body: TriagePatch) => void,
) => triageSections(t, carried, TODAY, ZONE, (_id, body) => record(body))

const overdue = { id: 't1', segment: 'overdue' as const, dueAt: '2026-10-02T13:30:00.000Z' }

describe('an overdue row', () => {
  const run = (heading: string | null, label: string): TriagePatch => {
    let sent: TriagePatch = {}
    const sections = sectionsFor(overdue, false, (body) => {
      sent = body
    })
    sections!
      .find((s) => s.heading === heading)!
      .actions.find((a) => a.label === label)!
      .run()
    return sent
  }

  it('offers the two ways out, and nothing else', () => {
    const sections = sectionsFor(overdue, false, () => {})
    expect(sections?.map((s) => s.heading)).toEqual(['Push the deadline', 'Make it a plan'])
    expect(sections?.map((s) => s.actions.map((a) => a.label))).toEqual([
      ['To tomorrow', 'To next week', 'Clear the deadline'],
      ['Today', 'Tomorrow', 'Next week'],
    ])
  })

  it('pushes the deadline to a new DAY and keeps the time of day', () => {
    // 13:30Z is 09:30 in Toronto. The wall clock is kept: moving the instant by 24h would be right
    // only outside a DST week.
    expect(run('Push the deadline', 'To tomorrow')).toEqual({
      dueAt: '2026-10-11T13:30:00.000Z',
    })
    // Next week is the following Monday, not seven days on.
    expect(run('Push the deadline', 'To next week')).toEqual({
      dueAt: '2026-10-12T13:30:00.000Z',
    })
  })

  it('clears the deadline without touching the plan', () => {
    expect(run('Push the deadline', 'Clear the deadline')).toEqual({ dueAt: null })
  })

  it('turns the deadline into a plan in ONE request, so the row is never half-way', () => {
    expect(run('Make it a plan', 'Today')).toEqual({ dueAt: null, scheduledOn: TODAY })
    expect(run('Make it a plan', 'Tomorrow')).toEqual({ dueAt: null, scheduledOn: '2026-10-11' })
    expect(run('Make it a plan', 'Next week')).toEqual({ dueAt: null, scheduledOn: '2026-10-12' })
  })
})

describe('a row whose plan was carried over', () => {
  const carried = { id: 't2', segment: 'today' as const, dueAt: null }
  const run = (label: string): TriagePatch => {
    let sent: TriagePatch = {}
    const sections = sectionsFor(carried, true, (body) => {
      sent = body
    })
    sections![0]!.actions.find((a) => a.label === label)!.run()
    return sent
  }

  it('offers one unlabelled cluster about the PLAN', () => {
    const sections = sectionsFor(carried, true, () => {})
    expect(sections).toHaveLength(1)
    expect(sections![0]!.heading).toBeNull()
    expect(sections![0]!.actions.map((a) => a.label)).toEqual([
      'Move to today',
      'Move to tomorrow',
      'Move to next week',
      'Clear the plan',
    ])
  })

  it('moves the plan and never the deadline', () => {
    for (const [label, scheduledOn] of [
      ['Move to today', TODAY],
      ['Move to tomorrow', '2026-10-11'],
      ['Move to next week', '2026-10-12'],
      ['Clear the plan', null],
    ] as const) {
      const body = run(label)
      expect(body).toEqual({ scheduledOn })
      expect('dueAt' in body, `${label} must leave the deadline alone`).toBe(false)
    }
  })
})

describe('a row with nothing to triage', () => {
  it('is offered nothing, so the slot stays empty', () => {
    // Planned for today: the plan is not late, so there is nothing to move it out of.
    expect(sectionsFor({ id: 't3', segment: 'today', dueAt: null }, false, () => {})).toBeNull()
    // In progress with a deadline still ahead.
    expect(
      sectionsFor(
        { id: 't4', segment: 'in_progress', dueAt: '2026-12-01T13:30:00.000Z' },
        false,
        () => {},
      ),
    ).toBeNull()
    // Overdue is the server's segment, not the date: however old the deadline looks, no actions.
    expect(
      sectionsFor(
        { id: 't5', segment: 'today', dueAt: '2020-01-01T00:00:00.000Z' },
        false,
        () => {},
      ),
    ).toBeNull()
  })
})
