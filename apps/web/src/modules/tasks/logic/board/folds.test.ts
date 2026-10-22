import { idFrom, projectId } from '@ctws/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBoardFolds, saveBoardFolds } from './folds'

const P1 = idFrom(projectId, 'p1')
const P2 = idFrom(projectId, 'p2')

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
  })
  return store
}

describe('the board’s folds', () => {
  it('round-trip per project, open and folded alike', () => {
    fakeStorage()
    saveBoardFolds(
      P1,
      new Map([
        ['todo:a', false],
        ['done:b', true],
      ]),
    )
    expect([...loadBoardFolds(P1)]).toEqual([
      ['todo:a', false],
      ['done:b', true],
    ])
    expect(loadBoardFolds(P2).size).toBe(0)
  })

  it('forget a project with none, and read nothing from what is not theirs', () => {
    const store = fakeStorage()
    saveBoardFolds(P1, new Map([['todo:a', false]]))
    saveBoardFolds(P1, new Map())
    expect(store.size).toBe(0)
    store.set('ctws.boardFolds.p1', '["todo:a"]')
    expect(loadBoardFolds(P1).size).toBe(0)
    store.set('ctws.boardFolds.p1', '{"todo:a":"no","done:b":true}')
    expect([...loadBoardFolds(P1)]).toEqual([['done:b', true]])
  })

  it('carry on without storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadBoardFolds(P1).size).toBe(0)
    expect(() => saveBoardFolds(P1, new Map([['todo:a', true]]))).not.toThrow()
  })
})
