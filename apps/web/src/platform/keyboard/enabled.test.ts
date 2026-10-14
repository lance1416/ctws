import { afterEach, describe, expect, it, vi } from 'vitest'
import { setShortcutsEnabled, shortcutsEnabled } from './enabled'

afterEach(() => {
  vi.unstubAllGlobals()
})

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v)
    },
  })
  return store
}

function fakeWindow() {
  const events: string[] = []
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => events.push(e.type) })
  return events
}

describe('shortcut enable setting', () => {
  it('defaults to on when nothing has been stored', () => {
    fakeStorage()
    expect(shortcutsEnabled()).toBe(true)
  })

  it('turns off, and the stored value is what a reload would read back', () => {
    const store = fakeStorage()
    fakeWindow()
    setShortcutsEnabled(false)
    expect(shortcutsEnabled()).toBe(false)
    // Asserting the stored string, not just the getter: a getter that cached in a module variable
    // would pass a read-back test and still come up enabled after a reload.
    expect(store.get('ctws.shortcuts.enabled')).toBe('0')
  })

  it('turns back on', () => {
    fakeStorage({ 'ctws.shortcuts.enabled': '0' })
    fakeWindow()
    setShortcutsEnabled(true)
    expect(shortcutsEnabled()).toBe(true)
  })

  it('announces the change so the other key handlers re-read it', () => {
    fakeStorage()
    const events = fakeWindow()
    setShortcutsEnabled(false)
    expect(events).toEqual(['ctws:shortcuts-changed'])
  })

  it('stays on, and does not throw, where localStorage throws', () => {
    // A private window, or site data blocked: an uncaught throw here blanks the whole page.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    fakeWindow()
    expect(shortcutsEnabled()).toBe(true)
    expect(() => setShortcutsEnabled(false)).not.toThrow()
  })
})
