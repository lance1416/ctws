import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCollapsed, saveCollapsed } from './collapse'

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
  })
}

describe('collapse state', () => {
  it('round-trips through storage', () => {
    fakeStorage()
    saveCollapsed('p1', new Set(['a', 'b']))
    expect([...loadCollapsed('p1')].sort()).toEqual(['a', 'b'])
  })

  it('keeps projects separate', () => {
    fakeStorage()
    saveCollapsed('p1', new Set(['a']))
    expect(loadCollapsed('p2').size).toBe(0)
  })

  it('loadCollapsed returns an empty set when getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    })
    expect(loadCollapsed('p1').size).toBe(0)
  })

  it('saveCollapsed does not throw when setItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(() => saveCollapsed('p1', new Set(['a']))).not.toThrow()
  })

  it('loadCollapsed returns an empty set when localStorage property access throws', () => {
    // Safari private mode throws on property access itself, not method calls
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('SecurityError')
      },
      configurable: true,
    })
    expect(loadCollapsed('p1').size).toBe(0)
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
    } else {
      delete (globalThis as any).localStorage
    }
  })

  it('returns an empty set for corrupt stored data', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{not json', setItem: () => {} })
    expect(loadCollapsed('p1').size).toBe(0)
  })

  it('filters out non-string values in corrupt stored data', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '["a",1,null]',
      setItem: () => {},
    })
    expect(loadCollapsed('p1')).toEqual(new Set(['a']))
  })
})
