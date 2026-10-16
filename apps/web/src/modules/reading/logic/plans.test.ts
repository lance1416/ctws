import { describe, expect, it } from 'vitest'
import { planChoices } from './plans'

const LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This week',
  nextWeek: 'Next week',
}

describe('the days to finish by', () => {
  it('names each of the four on a weekday', () => {
    // Wednesday 14 October 2026.
    expect(planChoices('2026-10-14', null, LABELS)).toEqual([
      { value: '2026-10-14', label: 'Today' },
      { value: '2026-10-15', label: 'Tomorrow' },
      { value: '2026-10-18', label: 'This week' },
      { value: '2026-10-19', label: 'Next week' },
    ])
  })

  it('keeps one entry per day when two names fall on it', () => {
    // Saturday: this week ends tomorrow.
    expect(planChoices('2026-10-17', null, LABELS)).toEqual([
      { value: '2026-10-17', label: 'Today' },
      { value: '2026-10-18', label: 'Tomorrow' },
      { value: '2026-10-19', label: 'Next week' },
    ])
  })

  it('keeps the day already set when it is none of the four', () => {
    expect(planChoices('2026-10-14', '2026-10-13', LABELS)[0]).toEqual({
      value: '2026-10-13',
      label: 'Yesterday',
    })
    expect(planChoices('2026-10-14', '2026-10-15', LABELS)).toHaveLength(4)
  })
})
