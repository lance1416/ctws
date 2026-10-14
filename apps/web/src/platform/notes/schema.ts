import { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize'

/**
 * THE SANITISER'S ALLOWLIST. Sanitising is not optional, because rendering
 * Markdown is the ONE place in this app where text becomes DOM.
 *
 * TWO LINES OF DEFENCE, AND WHY BOTH EXIST.
 *
 * 1. `react-markdown` is configured WITHOUT `rehype-raw`, so an HTML tag in the source is never
 *    parsed as HTML at all: `mdast-util-to-hast` drops the `html` node, tags and all. `<img
 *    onerror=...>` leaves nothing behind, and `<b onmouseover=...>x</b>` leaves `x` as prose.
 *    That is the primary defence, and it is structural (measured in `markdown.test.tsx`).
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
 * NOTHING IS ADDED TO THE ALLOWLIST, and that is a correction rather than an omission. The first
 * version of this file widened `code`'s `className` to keep `math-inline` and `math-display`,
 * reasoning that `rehype-katex` keys on them. It does not have to: it accepts `language-math` as
 * well -- which `defaultSchema`'s own `/^language-./` already allows -- and it derives display mode
 * from the `pre > code` structure, not from the class. The mutation that removed the widening was
 * caught only by a unit test asserting the class names, while the end-to-end test watched KaTeX
 * typeset the formula and passed. That is a test pinning an implementation detail over a
 * behaviour, and the honest fix was to delete BOTH the widening and the assertion: an allowlist
 * that allows less is strictly better, and `code`'s `className` stays a LIST OF VALUES rather than
 * an open `['className']`, so a pasted note still cannot wear the app's own classes.
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
  /**
   * Dropped WITH their text, rather than unwrapped. An element that is merely absent from
   * `tagNames` is replaced by its children, which for `<style>` means printing the CSS as visible
   * prose. Nothing here can execute once defence 1 is in place; this is about what a note looks
   * like when it contains one, and about what happens if defence 1 is ever removed.
   */
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'],
}
