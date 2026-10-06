import { describe, expect, it } from 'vitest'
import type { ProjectMovementResponse } from '@ctws/contracts'
import { activityLabel, hasMovement, QUIET_DAYS, stagnant } from './movement'

/**
 * The two judgements 做到哪儿了 makes. Both are about what is NOT shown, which is why they are
 * worth their own tests: a panel that always prints a stagnation line and one that never prints
 * one both pass a test that only checks the sentence's wording.
 */
const row = (p: Partial<ProjectMovementResponse> = {}): ProjectMovementResponse => ({
  projectId: p.projectId ?? 'p',
  projectName: p.projectName ?? '项目',
  doneThisWeek: p.doneThisWeek ?? 0,
  remaining: p.remaining ?? 0,
  overdue: p.overdue ?? 0,
  lastActivityOn: p.lastActivityOn ?? null,
  quietDays: p.quietDays ?? null,
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

describe('stagnant', () => {
  const quiet = (name: string, days: number | null, remaining = 1) =>
    row({
      projectId: name,
      projectName: name,
      quietDays: days,
      remaining,
      lastActivityOn: '2026-09-28',
    })

  it('says nothing when every project has been touched recently', () => {
    expect(stagnant([quiet('甲', 0), quiet('乙', QUIET_DAYS - 1)])).toBeNull()
  })

  it('names a project that has been silent for a whole week', () => {
    expect(stagnant([quiet('甲', 0), quiet('乙', QUIET_DAYS)])?.projectName).toBe('乙')
  })

  it('names the QUIETEST one, so the sentence does not depend on list order', () => {
    expect(stagnant([quiet('甲', 9), quiet('乙', 30), quiet('丙', 12)])?.projectName).toBe('乙')
    expect(stagnant([quiet('乙', 30), quiet('甲', 9)])?.projectName).toBe('乙')
  })

  it('ignores a project with nothing left to do: finished is not stagnant', () => {
    expect(stagnant([quiet('做完的', 40, 0)])).toBeNull()
    // ...and it does not hide a genuinely stalled one standing beside it.
    expect(stagnant([quiet('做完的', 40, 0), quiet('停住的', 8)])?.projectName).toBe('停住的')
  })

  it('ignores a project that has never had any activity to be quiet about', () => {
    expect(stagnant([row({ projectName: '空的', remaining: 3, quietDays: null })])).toBeNull()
  })
})

describe('activityLabel', () => {
  it('writes the month and day inside the current year', () => {
    expect(activityLabel('2026-09-28', '2026-10-05')).toBe('9月28日')
  })

  it('adds the year once the day is not in the current one', () => {
    expect(activityLabel('2025-12-30', '2026-10-05')).toBe('2025年12月30日')
  })
})
