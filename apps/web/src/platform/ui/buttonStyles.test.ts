import { describe, expect, it } from 'vitest'
import { BUTTON, ICON_BUTTON } from './buttonStyles'

describe('the button vocabulary', () => {
  it('sets the text size on every tone', () => {
    // Without it a button inherits the surrounding size and stands taller than the fields beside it.
    for (const [tone, cls] of Object.entries(BUTTON)) expect(cls, tone).toContain('text-ui')
  })

  it('gives the standalone tones the control height, radius and weight (tokens.md)', () => {
    for (const tone of ['primary', 'secondary', 'quiet', 'destructive'] as const) {
      expect(BUTTON[tone], tone).toContain('h-8')
      expect(BUTTON[tone], tone).toContain('rounded-control')
      expect(BUTTON[tone], tone).toContain('font-medium')
    }
  })

  it('frames a destructive button in red rather than filling it (artboard 3)', () => {
    expect(BUTTON.destructive).toContain('border-stop')
    expect(BUTTON.destructive).not.toContain('bg-stop ')
  })

  it('draws an icon-only button grey until hovered, so colour stays with kinds and states', () => {
    expect(ICON_BUTTON).toContain('text-muted')
    expect(ICON_BUTTON).toContain('hover:text-ink')
  })
})
