import { afterEach, describe, expect, it, vi } from 'vitest'
import { shownScheme } from './theme'

function page(chosen: string | null, systemDark: boolean) {
  vi.stubGlobal('document', { documentElement: { getAttribute: () => chosen } })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: systemDark }) })
}

describe('the scheme the page shows', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is the one chosen in the app, whatever the system's", () => {
    page('light', true)
    expect(shownScheme()).toBe('light')
    page('dark', false)
    expect(shownScheme()).toBe('dark')
  })

  it("follows the system's when nothing is chosen", () => {
    page(null, true)
    expect(shownScheme()).toBe('dark')
    page(null, false)
    expect(shownScheme()).toBe('light')
  })
})
