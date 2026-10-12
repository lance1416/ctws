import { afterEach, describe, expect, it, vi } from 'vitest'
import { recentList, recordRecent, type Recent } from './recent'

function memoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
}

const thing = (id: string, title = id): Recent => ({
  type: 'person',
  id,
  title,
  to: `/people/${id}`,
  kind: 'Person',
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('recently opened things', () => {
  it('puts the newest first and keeps one entry per thing', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    recordRecent(thing('a', '陈颖'))
    recordRecent(thing('b'))
    recordRecent(thing('a', '陈颖 (renamed)'))
    expect(recentList().map((r) => [r.id, r.title])).toEqual([
      ['a', '陈颖 (renamed)'],
      ['b', 'b'],
    ])
  })

  it('keeps the eight most recent', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    for (let i = 0; i < 12; i++) recordRecent(thing(`t${i}`))
    expect(recentList().map((r) => r.id)).toEqual([
      't11',
      't10',
      't9',
      't8',
      't7',
      't6',
      't5',
      't4',
    ])
  })

  it('a different kind with the same id is a different thing', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    recordRecent(thing('x'))
    recordRecent({ ...thing('x'), type: 'meeting', kind: 'Meeting' })
    expect(recentList()).toHaveLength(2)
  })

  it('forgets quietly when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => recordRecent(thing('a'))).not.toThrow()
    expect(recentList()).toEqual([])
  })

  it('ignores a stored value it did not write', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{not json', setItem: () => {} })
    expect(recentList()).toEqual([])
  })
})
