import { describe, expect, it } from 'vitest'
import { blockedLabel } from './blockedLabel'

const b = (title: string) => ({ id: title, title })

describe('blockedLabel', () => {
  it('says nothing when nothing is in the way', () => {
    expect(blockedLabel(undefined)).toBeNull()
    expect(blockedLabel([])).toBeNull()
  })

  it('names the one blocker, because naming it answers the question on the spot', () => {
    expect(blockedLabel([b('跑通 CI')])).toBe('Blocked by “跑通 CI”')
  })

  it('names the first and COUNTS THEM ALL, not the ones it did not name', () => {
    expect(blockedLabel([b('跑通 CI'), b('写迁移'), b('补测试')])).toBe(
      'Blocked by “跑通 CI” and 2 more',
    )
  })
})
