import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetRecent, recentList, recordRecent, type Recent } from './recent'

const ME = 'user-1'

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
    recordRecent(ME, thing('a', '陈颖'))
    recordRecent(ME, thing('b'))
    recordRecent(ME, thing('a', '陈颖 (renamed)'))
    expect(recentList(ME).map((r) => [r.id, r.title])).toEqual([
      ['a', '陈颖 (renamed)'],
      ['b', 'b'],
    ])
  })

  it('keeps the eight most recent', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    for (let i = 0; i < 12; i++) recordRecent(ME, thing(`t${i}`))
    expect(recentList(ME).map((r) => r.id)).toEqual([
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
    recordRecent(ME, thing('x'))
    recordRecent(ME, { ...thing('x'), type: 'meeting', kind: 'Meeting' })
    expect(recentList(ME)).toHaveLength(2)
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
    expect(() => recordRecent(ME, thing('a'))).not.toThrow()
    expect(recentList(ME)).toEqual([])
  })

  it('ignores a stored value it did not write', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{not json', setItem: () => {} })
    expect(recentList(ME)).toEqual([])
  })

  it('keeps each account to itself on a shared browser', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    recordRecent('user-1', thing('a', '陈颖'))
    expect(recentList('user-2')).toEqual([])
  })
})

describe('forgetting a thing that is gone', () => {
  it('drops that one thing and keeps the rest in order', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    recordRecent(ME, thing('a'))
    recordRecent(ME, thing('b'))
    recordRecent(ME, thing('c'))
    forgetRecent(ME, 'person', 'b')
    expect(recentList(ME).map((r) => r.id)).toEqual(['c', 'a'])
  })

  it('drops only that kind of thing, when two kinds share an id', () => {
    vi.stubGlobal('localStorage', memoryStorage())
    recordRecent(ME, thing('x'))
    recordRecent(ME, { ...thing('x'), type: 'meeting', kind: 'Meeting' })
    forgetRecent(ME, 'meeting', 'x')
    expect(recentList(ME).map((r) => r.type)).toEqual(['person'])
  })

  it('does not throw when storage does', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(() => forgetRecent(ME, 'person', 'a')).not.toThrow()
  })
})
