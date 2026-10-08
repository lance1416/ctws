import { describe, expect, it } from 'vitest'
import { noteFeatures } from './features'

/**
 * THE GUARD UNDER D73'S SECOND DECISION. `mermaid` and `katex` are fetched only for a note that
 * really uses them, and this function is what decides. Both kinds of mistake are real:
 *
 *   a false POSITIVE pulls ~300 KB of KaTeX (or ~1 MB of mermaid) onto a note of plain prose,
 *   a false NEGATIVE renders someone's formula as literal `$x$` and never says why.
 *
 * The cases below are the ones a regex-based scan gets wrong, which is why this one parses.
 */
/** A fenced block, written out of line so the cases below read as Markdown rather than escapes. */
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
    /**
     * TWO BARE PRICES ARE MATHS, and this test exists to say so rather than to wish otherwise.
     *
     * `cost $5 and $7 total` parses to an `inlineMath` node whose value is `5 and ` -- measured, not
     * assumed. micromark's `singleDollarTextMath` has no "must not end on whitespace" rule, so the
     * span opens at the first `$` and closes at the second.
     *
     * The consequence is honest and it is the right trade: such a note FETCHES KaTeX, and KaTeX then
     * typesets `5 and ` in the middle of the sentence. That is what the reader will see either way,
     * because `remark-math` is what renders the note; a scanner that "corrected" this would be a
     * second notion of maths, it would disagree with the renderer, and the disagreement shows up as
     * a real formula silently left as inline code. Being exact about a surprising grammar beats
     * being clever about it.
     */
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
    // highlight.js would otherwise GUESS, and a wrong guess paints shell output or a log file in
    // the colours of whatever language scored highest. An unlabelled fence stays plain text.
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
