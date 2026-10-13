import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE COLOUR TOKENS ARE NAMED FOR THEIR ROLE, and the old names are gone everywhere.
 *
 * The old set named planes by height (`surface`, `-panel`, `-raised`, `-sunken`), so the same
 * name meant the page in one place and a field in another, and choosing one meant guessing which
 * height a thing was. The new set says what a thing IS: the sheet you write on, the chrome around
 * it, the desk tiles sit on, anything that floats. A leftover old name would still compile -- an
 * unknown Tailwind class just draws nothing -- so this reads the source instead.
 */
const WEB = resolve(import.meta.dirname, '..')

const OLD =
  '(?:surface(?:-(?:panel|raised|sunken|hover))?|fg(?:-(?:muted|subtle))?|border-(?:subtle|strong)|accent(?:-fg)?|danger-fg)'
const UTILITY =
  '(?:bg|text|border(?:-[xytblrse])?|ring(?:-offset)?|outline|divide|fill|stroke|decoration|caret|placeholder|accent|shadow|from|via|to)'
const PATTERNS = [
  new RegExp(`(?<![\\w-])${UTILITY}-${OLD}(?![\\w-])`),
  new RegExp(`--color-${OLD}(?![\\w-])`),
  /(?<![\w-])shadow-panel(?![\w-])/,
]

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

describe('colour tokens', () => {
  it('no file names a token from the old vocabulary', () => {
    const found = files().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          PATTERNS.some((p) => p.test(line))
            ? [`${file.slice(WEB.length + 1)}:${i + 1}  ${line.trim()}`]
            : [],
        ),
    )
    expect(found, found.join('\n')).toEqual([])
  })
})

/**
 * RADIUS BY ROLE, NOT BY HABIT: 0 for structure (paper, sections, rows), 6px for controls, 10px for
 * what floats and the Workbench's tiles, round for markers. The old 8px and 12px corners belonged
 * to no role, and a row with a corner reads as a button. Two small exceptions keep their own: a key
 * chip is 4px (a `rounded` that sits with its `border` and `text-xs`), and a note's checkbox glyph.
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
