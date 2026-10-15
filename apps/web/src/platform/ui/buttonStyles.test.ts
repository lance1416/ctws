import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUTTON } from './buttonStyles'

const SRC = resolve(import.meta.dirname, '../..')
const walk = (at: string): string[] =>
  readdirSync(at, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(at, e.name)) : /\.tsx$/.test(e.name) ? [join(at, e.name)] : [],
  )

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

  it('leaves no filled button written by hand', () => {
    // A filled button's text is `on-ink` or `on-danger`, and only `BUTTON` may say so. Read off
    // the source, because a component no test renders leaves nothing in the DOM.
    const offenders = walk(SRC).filter((f) => /text-on-(ink|danger)/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([])
  })
})
