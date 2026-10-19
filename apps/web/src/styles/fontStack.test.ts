import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE FONT STACKS, entry by entry and in order: `toContain('PingFang SC')` would pass on a stack
 * that had lost `-apple-system`, or that had put the CJK face in front of the Latin one.
 */
const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8')

/** A custom property's value in styles.css, as an ordered list of family names, unquoted. */
const families = (property: string): string[] => {
  const value = new RegExp(`${property}:\\s*([^;]+);`).exec(css)?.[1] ?? ''
  return value
    .split(',')
    .map((name) => name.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
}

/** Everything from `-apple-system` on is Semi Design's string. */
const FONT_SANS = [
  'Inter Variable',
  'CTWS Noto Sans SC',
  '-apple-system',
  'BlinkMacSystemFont',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Segoe UI',
  'Helvetica Neue',
  'Helvetica',
  'Arial',
  'sans-serif',
]

/** JetBrains Mono, then Ant Design 5's `fontFamilyCode`. */
const FONT_MONO = [
  'JetBrains Mono Variable',
  'SFMono-Regular',
  'Consolas',
  'Liberation Mono',
  'Menlo',
  'Courier',
  'monospace',
]

describe('the font stack', () => {
  const sans = families('--font-sans')

  it('is what the body is set in', () => {
    expect(css).toMatch(/\nbody \{[^}]*font-family: var\(--font-sans\);/)
  })

  // Each named fact is its own assertion, so a change says which reason it breaks before the
  // whole-list comparison says only that the list differs.
  it('puts Latin first: handing Latin to Noto would throw away the reason Inter is self-hosted', () => {
    expect(sans.indexOf('Inter Variable')).toBeLessThan(sans.indexOf('CTWS Noto Sans SC'))
  })

  it('puts the webfont before the system CJK faces', () => {
    expect(sans.indexOf('CTWS Noto Sans SC')).toBeLessThan(sans.indexOf('PingFang SC'))
  })

  it('names no serif family but the terminal sans-serif', () => {
    expect(sans.filter((name) => /serif/i.test(name))).toEqual(['sans-serif'])
  })

  it('is the spec string, entry for entry', () => {
    expect(sans).toEqual(FONT_SANS)
    expect(families('--font-mono')).toEqual(FONT_MONO)
  })
})
