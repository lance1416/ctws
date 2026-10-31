import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { previewDecorations } from './livePreview'

/** A note with the cursor at `‸` (not `|`, which tables are made of), parsed through. */
function note(text: string) {
  const at = text.indexOf('‸')
  const doc = text.replace('‸', '')
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(at === -1 ? 0 : at),
    extensions: [markdown({ base: markdownLanguage })],
  })
  ensureSyntaxTree(state, state.doc.length, 5000)
  return state
}

/** What the preview does where: the text it covers, and what it is (a widget, hidden, a class). */
function drawn(text: string) {
  const state = note(text)
  return previewDecorations(state).map((r) => {
    const spec = r.value.spec as { widget?: object; class?: string; attributes?: object }
    const what = spec.widget
      ? spec.widget.constructor.name
      : r.value.point && r.from < r.to
        ? 'hidden'
        : (spec.class ?? 'line')
    return [state.sliceDoc(r.from, r.to), what] as const
  })
}

describe('the live preview', () => {
  it('grounds the cursor’s line, and only that one', () => {
    expect(drawn('one\ntw‸o\nthree').filter(([, w]) => w === 'cm-md-active')).toHaveLength(1)
  })

  it('hides a heading’s marks off the cursor’s line, and shows them on it', () => {
    expect(drawn('## Plan\n\nso‸on')).toContainEqual(['## ', 'hidden'])
    expect(drawn('## Pl‸an\n\nsoon')).toContainEqual(['##', 'cm-md-mark'])
    // The heading's own step either way: the text never changes size.
    expect(drawn('## Pl‸an')).toContainEqual(['', 'cm-md-h2'])
  })

  it('hides bold and code marks off the line, styling the words either way', () => {
    const away = drawn('say **soon** and `x`\n\n‸')
    expect(away).toContainEqual(['**', 'hidden'])
    expect(away).toContainEqual(['`', 'hidden'])
    expect(away).toContainEqual(['**soon**', 'cm-md-strong'])
    const here = drawn('say **so‸on**')
    expect(here).toContainEqual(['**', 'cm-md-mark'])
    expect(here).not.toContainEqual(['**', 'hidden'])
  })

  it('draws a mention as its chip off the line, and as its words on it, never its address', () => {
    const link = '[@Mira Chen](ctws://person/01a18f86-c7d2-7431-b071-f14f685fdd6f)'
    expect(drawn(`With ${link} today\n\n‸`)).toContainEqual([link, 'MentionWidget'])
    const here = drawn(`With ${link} to‸day`)
    // Only its `@` a mark; the name in the text's own face.
    expect(here).toContainEqual(['@', 'cm-md-mark'])
    expect(here).toContainEqual(['Mira Chen', 'cm-md-mention'])
    expect(here).toContainEqual(['[', 'hidden'])
    expect(here).toContainEqual(['](ctws://person/01a18f86-c7d2-7431-b071-f14f685fdd6f)', 'hidden'])
  })

  it('draws a task’s box off the line, and its `- [ ]` on it', () => {
    expect(drawn('- [ ] Call\n- [x] Done\n\n‸')).toEqual(
      expect.arrayContaining([
        ['- [ ] ', 'CheckboxWidget'],
        ['- [x] ', 'CheckboxWidget'],
      ]),
    )
    expect(drawn('- [ ] Ca‸ll')).toContainEqual(['[ ]', 'cm-md-mark'])
  })

  it('draws a link’s words off the line; on it, its marks and its address cut short', () => {
    expect(drawn('[Stripe docs](https://stripe.com/docs)\n\n‸')).toContainEqual(['[', 'hidden'])
    const here = drawn('[Stripe‸ docs](https://stripe.com/docs)')
    expect(here).toContainEqual(['stripe.com/docs', 'EllipsisWidget'])
  })

  it('draws a table and a formula block whole until the cursor enters them', () => {
    const table = '| Thing | Size |\n| --- | --- |\n| Payments | 40 |'
    expect(drawn(`${table}\n\n‸`)).toContainEqual([table, 'TableWidget'])
    expect(drawn(`| Thing | Si‸ze |\n| --- | --- |\n| Payments | 40 |`)).not.toContainEqual([
      table,
      'TableWidget',
    ])
    const formula = '$$\np = 1 - (1 - r)^n\n$$'
    expect(drawn(`${formula}\n\n‸`)).toContainEqual([formula, 'MathWidget'])
    expect(drawn(`$$\np = 1 - (1 - r)^n‸\n$$`)).not.toContainEqual([formula, 'MathWidget'])
  })

  it('draws inline maths off the line, and never a dollar inside code', () => {
    expect(drawn('Euler: $e^{i\\pi}$\n\n‸')).toContainEqual(['$e^{i\\pi}$', 'MathWidget'])
    expect(drawn('cost `$5 and $6`\n\n‸').some(([, what]) => what === 'MathWidget')).toBe(false)
  })

  it('gives a fence a head with its language until the cursor enters it', () => {
    const away = drawn('```ts\nconst a = 1\n```\n\n‸')
    expect(away).toContainEqual(['```ts', 'CodeHeadWidget'])
    expect(away).toContainEqual(['```', 'hidden'])
    expect(drawn('```ts\nconst a‸ = 1\n```').some(([, w]) => w === 'CodeHeadWidget')).toBe(false)
  })
})
