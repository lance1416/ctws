import { describe, expect, it } from 'vitest'
import { idFrom, projectId, type ProjectMovementResponse } from '@ctws/contracts'
import { hasMovement, movedLine, QUIET_DAYS } from './movement'

const row = (p: Partial<ProjectMovementResponse> = {}): ProjectMovementResponse => ({
  projectId: p.projectId ?? idFrom(projectId, 'p'),
  projectName: p.projectName ?? 'Projects',
  doneThisWeek: p.doneThisWeek ?? 0,
  remaining: p.remaining ?? 0,
  overdue: p.overdue ?? 0,
  lastActivityOn: p.lastActivityOn ?? null,
  quietDays: p.quietDays ?? null,
  nextDueOn: p.nextDueOn ?? null,
})

describe('hasMovement', () => {
  it('keeps a project with open work, or with something finished this week', () => {
    expect(hasMovement(row({ remaining: 1 }))).toBe(true)
    expect(hasMovement(row({ doneThisWeek: 1 }))).toBe(true)
  })

  it('drops a project with neither: "0 and 0" is not news', () => {
    expect(hasMovement(row())).toBe(false)
  })
})

describe('movedLine', () => {
  const TODAY = '2026-10-12' // a Monday

  it('says what was done and when it last moved', () => {
    expect(movedLine(row({ doneThisWeek: 1, remaining: 3, lastActivityOn: TODAY }), TODAY)).toBe(
      '1 done, moved today',
    )
  })

  it('says only when, when nothing was done this week', () => {
    expect(movedLine(row({ remaining: 3, lastActivityOn: '2026-10-11' }), TODAY)).toBe(
      'Moved yesterday',
    )
    expect(movedLine(row({ remaining: 3, lastActivityOn: '2026-10-08' }), TODAY)).toBe(
      'Moved Thursday',
    )
    expect(movedLine(row({ remaining: 3, lastActivityOn: '2026-09-28' }), TODAY)).toBe(
      'Moved Sep 28',
    )
  })

  it('says a project with open work has gone quiet, and for how long', () => {
    expect(
      movedLine(
        row({ remaining: 2, lastActivityOn: '2026-09-30', quietDays: QUIET_DAYS + 5 }),
        TODAY,
      ),
    ).toBe('Quiet for 12 days')
  })

  it('does not call a finished project quiet', () => {
    expect(
      movedLine(
        row({ doneThisWeek: 2, remaining: 0, lastActivityOn: '2026-10-09', quietDays: 9 }),
        TODAY,
      ),
    ).toBe('2 done, moved Friday')
  })
})
