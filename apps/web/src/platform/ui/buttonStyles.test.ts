import { describe, expect, it } from 'vitest'
import { BUTTON } from './buttonStyles'

describe('the button vocabulary', () => {
  it('sets the text size on every tone', () => {
    // Without it a button inherits 16px and stands taller than the 14px fields beside it.
    for (const [tone, cls] of Object.entries(BUTTON)) expect(cls, tone).toContain('text-sm')
  })

  it('gives the standalone tones one height and one radius', () => {
    for (const tone of ['primary', 'secondary', 'quiet', 'destructive'] as const) {
      expect(BUTTON[tone], tone).toContain('h-9')
      expect(BUTTON[tone], tone).toContain('rounded-md')
    }
  })
})
