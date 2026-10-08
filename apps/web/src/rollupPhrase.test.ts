import type { RollupResponse } from '@ctws/contracts'
import { describe, expect, it } from 'vitest'
import { rollupPhrase } from './rollupPhrase'

const roll = (over: Partial<RollupResponse> = {}): RollupResponse => ({
  progress: 0,
  counts: { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 },
  overdue: 0,
  dueSoon: 0,
  lastActivityAt: null,
  ...over,
})

describe('rollupPhrase', () => {
  it('writes the spec §7.3 line when there is all of it to say', () => {
    const r = roll({
      progress: 0.42,
      counts: { backlog: 0, todo: 3, in_progress: 2, done: 4, cancelled: 0 },
      overdue: 1,
    })
    expect(rollupPhrase(r)).toBe('42% · 2 in progress · 1 overdue')
  })

  it('ROUNDS the percentage, rather than truncating it', () => {
    // 2/3 is the case that tells the two apart: rounding says 67, truncation says 66. Truncating
    // would report 99% for a parent whose every child is done but one is 0.995.
    expect(rollupPhrase(roll({ progress: 2 / 3 }))).toBe('67%')
    expect(rollupPhrase(roll({ progress: 1 / 3 }))).toBe('33%')
    expect(rollupPhrase(roll({ progress: 1 }))).toBe('100%')
  })

  it('drops a LONE 0%, which is what most parents in a fresh tree would show', () => {
    // Every task starts on todo, so every parent has a number. Without this, half the rows in
    // any tree grow a second line to say 「0%」 -- which the children listed under them already
    // say, in more detail.
    expect(rollupPhrase(roll({ progress: 0 }))).toBeNull()
  })

  it('keeps the 0% when something else on the line needs the context', () => {
    expect(rollupPhrase(roll({ progress: 0, counts: { ...roll().counts, in_progress: 1 } }))).toBe(
      '0% · 1 in progress',
    )
    expect(rollupPhrase(roll({ progress: 0, overdue: 2 }))).toBe('0% · 2 overdue')
  })

  it('drops each tail part that has nothing to report', () => {
    expect(rollupPhrase(roll({ progress: 0.5, overdue: 2 }))).toBe('50% · 2 overdue')
    expect(
      rollupPhrase(roll({ progress: 0.5, counts: { ...roll().counts, in_progress: 1 } })),
    ).toBe('50% · 1 in progress')
  })

  it('says nothing at all when the subtree is merely unstarted', () => {
    // Every child excluded (all backlog), nothing running, nothing late. The marker at the head
    // of the row already says this; a second line of nothing is noise.
    expect(
      rollupPhrase(roll({ progress: null, counts: { ...roll().counts, backlog: 3 } })),
    ).toBeNull()
  })

  it('still speaks when there is no percentage but something is late', () => {
    expect(rollupPhrase(roll({ progress: null, overdue: 1 }))).toBe('1 overdue')
  })

  it('leaves dueSoon off the row', () => {
    // It is in the rollup for the banner and the board; on a row it would be a fourth number
    // next to the row's own deadline, which is already shown to the minute.
    expect(rollupPhrase(roll({ progress: 0.5, dueSoon: 3 }))).toBe('50%')
  })

  it('is null for a row the rollup knows nothing about', () => {
    expect(rollupPhrase(undefined)).toBeNull()
  })
})
