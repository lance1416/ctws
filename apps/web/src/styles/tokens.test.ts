import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const WEB = resolve(import.meta.dirname, '../..')

const files = (): string[] => {
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(at, e.name))
        : /\.(tsx?|css)$/.test(e.name) && e.name !== 'tokens.test.ts'
          ? [join(at, e.name)]
          : [],
    )
  return [...walk(join(WEB, 'src')), ...walk(join(WEB, 'e2e'))]
}

/**
 * RADIUS BY ROLE, NOT BY HABIT: 0 for structure (paper, sections, rows), 6px for controls, 10px for
 * what floats and the Workbench's tiles, round for markers. A row with a corner reads as a button.
 * Two small exceptions keep their own: a key chip is 4px (a `rounded` that sits with its `border`
 * and `text-xs`), and a note's checkbox glyph.
 */
describe('radius by role', () => {
  it('no class asks for a corner outside the scale', () => {
    const found = files()
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) => {
            const offScale = /(?<![\w-])rounded-(?:lg|xl|2xl|3xl)(?![\w-])/.test(line)
            const bare = /(?<![\w-])rounded(?![\w-])/.test(line)
            const keyChip = bare && /\bborder\b/.test(line) && /\btext-xs\b/.test(line)
            const glyph = /rounded-sm/.test(line) && /align-text-top/.test(line)
            const sm = /(?<![\w-])rounded-sm(?![\w-])/.test(line) && !glyph
            return offScale || (bare && !keyChip) || sm
              ? [`${file.slice(WEB.length + 1)}:${i + 1}  ${line.trim()}`]
              : []
          }),
      )
    expect(found, found.join('\n')).toEqual([])
  })
})
