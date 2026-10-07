import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'

/**
 * THE SANITISER'S ALLOWLIST. D73's first decision: 「消毒不可选」 -- sanitising is not optional,
 * because rendering Markdown is the ONE place in this app where text becomes DOM.
 *
 * TWO LINES OF DEFENCE, AND WHY BOTH EXIST.
 *
 * 1. `react-markdown` is configured WITHOUT `rehype-raw`, so an HTML tag in the source is never
 *    parsed as HTML at all -- `<img onerror=...>` arrives at the renderer as a TEXT node and is
 *    printed as the characters the author typed. That is the primary defence, and it is structural.
 * 2. This schema is the second. It is not redundant: the day someone adds `rehype-raw` (to let a
 *    note use `<kbd>` or a `<details>` block, say) defence 1 evaporates in one line and this is
 *    the only thing left. It is also what constrains the parts of the pipeline that DO synthesise
 *    markup -- GFM's footnote links and task lists, and the maths fences below.
 *
 * STARTS FROM `defaultSchema`, NOT FROM NOTHING. That is GitHub's own comment allowlist: no
 * `script`, no `style`, no `iframe`, no event handlers at all (an attribute absent from the list is
 * dropped, so `onerror` and friends need no rule of their own), `href` restricted to
 * http/https/mailto/irc/xmpp (so `javascript:` is dropped), and `id`/`name` prefixed with
 * `user-content-` so a note cannot clobber a DOM property the app reads.
 *
 * THE ONE ADDITION is the pair of class names `remark-math` puts on its fences. `remark-math`
 * emits `<code class="language-math math-inline">` / `math-display`, and `rehype-katex` finds its
 * work by exactly those two class names. `defaultSchema` allows `className` on `code` only where
 * it matches `/^language-./`, which keeps `language-math` and drops `math-inline` -- so without
 * this line maths silently renders as inline code. The allowlist stays a LIST OF VALUES rather
 * than becoming `['className']`: an open `className` on `code` would let a pasted note wear any
 * class the stylesheet happens to contain.
 *
 * ORDER MATTERS, AND IT IS SANITISE-THEN-TYPESET (`NoteMarkdown`'s `rehypePlugins`). The maths
 * that reaches KaTeX is a TEXT node this schema has already been over; KaTeX then generates its
 * own markup from that text with `trust: false`, so `\href`, `\url` and `\includegraphics` are
 * refused at the TeX level. The other order -- typeset, then sanitise -- would mean allowing
 * `style` on spans and the whole MathML vocabulary through the allowlist, to protect output that
 * was never attacker-written in the first place. That is a worse trade and it is not taken.
 */
export const noteSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [['className', /^language-./, 'math-inline', 'math-display']],
  },
  /**
   * Dropped WITH their text, rather than unwrapped. An element that is merely absent from
   * `tagNames` is replaced by its children, which for `<style>` means printing the CSS as visible
   * prose. Nothing here can execute once defence 1 is in place; this is about what a note looks
   * like when it contains one, and about what happens if defence 1 is ever removed.
   */
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'],
}
