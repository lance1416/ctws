import { renderToStaticMarkup } from 'react-dom/server'
import rehypeSanitize from 'rehype-sanitize'
import { describe, expect, it } from 'vitest'
import NoteMarkdown from './NoteMarkdown'
import { noteSchema } from './schema'

/**
 * RENDERING A NOTE, AND REFUSING TO RENDER AN ATTACK.
 *
 * Markdown is the one place in this app where text becomes DOM, so the interesting tests are not
 * "a heading becomes an h2" but "this specific injection does not become an element". There are two
 * defences (see `schema.ts`) and they are tested SEPARATELY, because the first one masks the second:
 *
 *   `describe("a note's own Markdown")` goes through the real component, which has no `rehype-raw`,
 *   so an HTML tag in the source is printed as characters.
 *
 *   `describe('the sanitiser itself')` hands the schema a hast tree that ALREADY contains the
 *   elements, which is what the pipeline would look like the day `rehype-raw` is added for one
 *   convenience or another. Without this half the schema could be empty and every test above
 *   would still pass, so the file would claim a coverage it does not have.
 */

const render = (source: string) => renderToStaticMarkup(<NoteMarkdown source={source} />)

describe("a note's own Markdown", () => {
  it('renders GFM: a table, a task list and strikethrough', () => {
    const html = render(
      [
        '| 项 | 值 |',
        '| --- | --- |',
        '| a | 1 |',
        '',
        '- [x] 做完了',
        '- [ ] 还没有',
        '',
        '~~删掉~~',
      ].join('\n'),
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<th>项</th>')
    expect(html).toContain('<del>删掉</del>')
    // GFM's `<input type=checkbox disabled>` is replaced by a labelled mark: reading mode is
    // pinned to contain NOT ONE control, and that must not become conditional on a note's text.
    expect(html).not.toContain('<input')
    expect(html).toContain('aria-label="Checked"')
    expect(html).toContain('aria-label="Empty"')
  })

  it('renders a fenced code block with its language class', () => {
    const html = render('```js\nconst a = 1\n```')
    expect(html).toContain('<pre>')
    expect(html).toContain('class="language-js"')
  })

  it('leaves maths for KaTeX to pick up, tagged the way rehype-katex looks for it', () => {
    /**
     * KaTeX itself is not loaded here (it arrives in an effect, and this is a static render), so
     * what is pinned is the HANDOFF: the class `rehype-katex` keys on survived the sanitiser. Lose
     * it and maths renders as inline code forever, silently.
     *
     * `language-math` AND NOT `math-inline`. `rehype-katex` takes `language-math` on its own and
     * reads display mode from the `pre > code` structure, so naming `math-inline` as well would
     * fail on a tree KaTeX typesets perfectly well -- an implementation detail, not the claim.
     */
    const html = render('面积是 $\\pi r^2$ 。')
    expect(html).toContain('language-math')
  })

  /**
   * WHAT ACTUALLY HAPPENS TO RAW HTML, measured rather than assumed. `remark` parses `<script>` into
   * an mdast `html` node, and `mdast-util-to-hast` without `allowDangerousHtml` DROPS those nodes --
   * so the tag is not escaped into `&lt;script&gt;`, it is gone, and only the text that sat between
   * the two tags remains as prose. An earlier draft of these tests asserted the escaped form and
   * failed, which is the only reason this comment can state the behaviour instead of guessing it.
   */
  it('drops a script tag in the source, tag and all', () => {
    const html = render('看这个 <script>alert(1)</script> 结束')
    expect(html).not.toContain('script')
    // The characters between the tags are prose now, not code: nothing can run them.
    expect(html).toContain('看这个 alert(1) 结束')
  })

  it('drops an img and its onerror handler', () => {
    const html = render('<img src=x onerror="alert(1)">')
    expect(html).not.toContain('<img')
    expect(html.toLowerCase()).not.toContain('onerror')
  })

  it('drops an iframe', () => {
    const html = render('<iframe src="https://example.invalid/"></iframe>')
    expect(html).not.toContain('iframe')
  })

  it('drops an HTML element but keeps the words inside it', () => {
    const html = render('这是 <b onmouseover="alert(1)">粗体</b> 字')
    expect(html).not.toContain('<b')
    expect(html.toLowerCase()).not.toContain('onmouseover')
    expect(html).toContain('粗体')
  })

  it('drops a javascript: href from a Markdown link', () => {
    const html = render('[点我](javascript:alert(1))')
    expect(html).not.toContain('javascript:')
    // The link text survives -- the note is still readable, it just has nothing to navigate to.
    expect(html).toContain('点我')
  })

  it('keeps an ordinary http link, and opens it away from the app', () => {
    const html = render('[文档](https://example.com/a)')
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('rel="noreferrer noopener"')
  })
})

/** Walks a hast tree and reports every tag name and every attribute name in it. */
function shape(tree: unknown): { tags: string[]; attrs: string[]; hrefs: string[] } {
  const tags: string[] = []
  const attrs: string[] = []
  const hrefs: string[] = []
  const walk = (node: Record<string, unknown>) => {
    if (node.type === 'element') {
      tags.push(String(node.tagName))
      const props = (node.properties ?? {}) as Record<string, unknown>
      for (const [key, value] of Object.entries(props)) {
        attrs.push(key)
        if (key.toLowerCase() === 'href') hrefs.push(String(value))
      }
    }
    for (const child of (node.children ?? []) as Record<string, unknown>[]) walk(child)
  }
  walk(tree as Record<string, unknown>)
  return { tags, attrs, hrefs }
}

const el = (tagName: string, properties: Record<string, unknown> = {}) => ({
  type: 'element',
  tagName,
  properties,
  children: [{ type: 'text', value: 'x' }],
})

/** The schema's own transformer, applied to a tree that already contains the attack. */
function sanitize(children: unknown[]): unknown {
  const transform = rehypeSanitize(noteSchema) as (tree: unknown) => unknown
  return transform({ type: 'root', children })
}

describe('the sanitiser itself', () => {
  it('strips a script element and its text', () => {
    const out = sanitize([
      {
        type: 'element',
        tagName: 'script',
        properties: {},
        children: [{ type: 'text', value: 'alert(1)' }],
      },
    ])
    expect(shape(out).tags).not.toContain('script')
    expect(JSON.stringify(out)).not.toContain('alert(1)')
  })

  it('drops an onerror handler however it is spelled, and the img with it', () => {
    const out = sanitize([
      el('img', { src: 'x', onerror: 'alert(1)', onError: 'alert(1)' }),
      el('div', { onClick: 'alert(1)' }),
    ])
    const { attrs } = shape(out)
    expect(attrs.filter((a) => a.toLowerCase().startsWith('on'))).toEqual([])
  })

  it('drops a javascript: href and keeps an http one', () => {
    const out = sanitize([
      el('a', { href: 'javascript:alert(1)' }),
      el('a', { href: 'https://ok.example/' }),
    ])
    expect(shape(out).hrefs).toEqual(['https://ok.example/'])
  })

  it('removes an iframe, an object and an embed', () => {
    const out = sanitize([
      el('iframe', { src: 'https://evil.invalid/' }),
      el('object'),
      el('embed'),
    ])
    const { tags } = shape(out)
    for (const tag of ['iframe', 'object', 'embed']) expect(tags).not.toContain(tag)
  })

  it('removes a style element together with its CSS', () => {
    const out = sanitize([
      {
        type: 'element',
        tagName: 'style',
        properties: {},
        children: [{ type: 'text', value: 'body{display:none}' }],
      },
    ])
    expect(shape(out).tags).not.toContain('style')
    expect(JSON.stringify(out)).not.toContain('display:none')
  })

  it("keeps a fence's language class and drops every other class", () => {
    const out = sanitize([
      el('code', { className: ['language-math', 'math-inline'] }),
      el('code', { className: ['fixed', 'inset-0', 'bg-scrim'] }),
    ])
    const json = JSON.stringify(out)
    // What KaTeX and the code-fence styling both need.
    expect(json).toContain('language-math')
    // A pasted note must not get to wear the app's own layout classes.
    expect(json).not.toContain('inset-0')
    expect(json).not.toContain('bg-scrim')
  })

  it('prefixes an id so a note cannot clobber something the app reads', () => {
    const out = sanitize([el('div', { id: 'root' })])
    expect(JSON.stringify(out)).toContain('user-content-root')
  })
})
