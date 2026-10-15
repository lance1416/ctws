import { describe, expect, it } from 'vitest'
import { noteFeatures } from './features'

/**
 * A false positive loads a renderer for plain prose; a false negative leaves a formula as literal
 * `$x$`. These are the cases a regex gets wrong.
 */
/** A fenced block, built out of line so the cases read as Markdown rather than escapes. */
const fence = (lang: string, body: string) => ['```' + lang, body, '```'].join('\n')

describe('noteFeatures', () => {
  it('finds nothing in plain prose', () => {
    expect(noteFeatures('先问清需求，再排期。\n\n- 一条\n- 两条')).toEqual({
      math: false,
      mermaid: false,
      highlight: false,
    })
  })

  it('finds nothing in an empty or absent note', () => {
    const none = { math: false, mermaid: false, highlight: false }
    expect(noteFeatures('')).toEqual(none)
    expect(noteFeatures(null)).toEqual(none)
  })

  it('finds inline and display maths', () => {
    expect(noteFeatures('面积是 $\\pi r^2$ 。').math).toBe(true)
    expect(noteFeatures('$$\n\\frac{1}{2}\n$$').math).toBe(true)
  })

  it('agrees with remark-math even where remark-math is surprising', () => {
    // `$5 and $7` is one inline-maths span to micromark; the scan agrees with the renderer
    // rather than correcting it.
    expect(noteFeatures('cost $5 and $7 total').math).toBe(true)
    // One lone dollar is not a span, so a single price costs nothing.
    expect(noteFeatures('买一个 $5 就够了').math).toBe(false)
  })

  it('does not read a dollar inside a code span or fence as maths', () => {
    expect(noteFeatures('run `echo $HOME and $PWD` first').math).toBe(false)
    expect(noteFeatures('```sh\necho $HOME $PWD\n```').math).toBe(false)
  })

  it('finds a mermaid fence, and only on the info string', () => {
    expect(noteFeatures('```mermaid\ngraph TD; A-->B;\n```').mermaid).toBe(true)
    expect(noteFeatures('```Mermaid\ngraph TD; A-->B;\n```').mermaid).toBe(true)
    // Prose that merely mentions it, or a fence of another language whose body says the word.
    expect(noteFeatures('我们用 mermaid 画图').mermaid).toBe(false)
    expect(noteFeatures('```text\nmermaid\n```').mermaid).toBe(false)
  })

  it('finds a fence that carries a language, and wants it highlighted', () => {
    expect(noteFeatures(fence('ts', 'const a = 1')).highlight).toBe(true)
    expect(noteFeatures(fence('sh', 'pnpm build')).highlight).toBe(true)
  })

  it('leaves a fence with no language alone', () => {
    expect(noteFeatures(fence('', 'some output')).highlight).toBe(false)
    expect(noteFeatures('    indented code').highlight).toBe(false)
  })

  it('does not ask for highlighting on a mermaid fence, which is not code to read', () => {
    expect(noteFeatures(fence('mermaid', 'graph TD; A-->B;'))).toEqual({
      math: false,
      mermaid: true,
      highlight: false,
    })
  })

  it('reports the three independently', () => {
    const note = ['$x$', '', fence('mermaid', 'graph TD; A-->B;'), '', fence('ts', 'let a')].join(
      '\n',
    )
    expect(noteFeatures(note)).toEqual({ math: true, mermaid: true, highlight: true })
  })

  it('looks inside list items and tables, not only at the top level', () => {
    expect(noteFeatures('- 面积 $\\pi r^2$').math).toBe(true)
    expect(noteFeatures('| a | b |\n| - | - |\n| $x^2$ | y |').math).toBe(true)
  })
})
