import DOMPurify from 'dompurify'

/**
 * HOW MERMAID IS CONTAINED.
 *
 * Mermaid is the sharp edge of this feature. It is not a renderer that produces text; it is a
 * ~1 MB interpreter that EXECUTES a grammar, it has a CVE history, and in the general case a
 * diagram's labels and `classDef` rules are attacker-chosen text. The author here is the user --
 * but the user PASTES, and a pasted diagram is the realistic threat.
 *
 * FOUR LAYERS, in the order they apply:
 *
 * 1. IT IS NOT LOADED unless the note really contains a `mermaid` fence (`features.ts`). An
 *    interpreter that was never fetched has no attack surface, so loading on demand is a
 *    security property as well as a speed one.
 * 2. IT IS CONFIGURED SHUT (`MermaidDiagram.tsx`): `securityLevel: 'strict'`, `htmlLabels: false`
 *    on every family that offers it, and `mermaid.render`'s `bindFunctions` is deliberately NEVER
 *    called -- that callback is how a diagram's `click` directives become live listeners.
 * 3. ITS OUTPUT GOES THROUGH DOMPURIFY, with the SVG profile. Mermaid's svg is markup this app did
 *    not write, so it is sanitised the way the note's own text is.
 * 4. WHAT SURVIVES IS NEVER RE-SERIALISED. DOMPurify hands back a `DocumentFragment` and the
 *    fragment is adopted with `replaceChildren` -- there is no string, no `innerHTML`, no second
 *    parse. Mutation XSS is the bug class where sanitised TEXT re-parses into different MARKUP, and
 *    the only reliable answer to it is to never go back through the parser. The stylesheet mermaid
 *    generates is narrowed AFTER sanitising, through the CSSOM (`scopeDiagramStyles`), for the same
 *    reason: rules are inspected as parsed objects, never rebuilt as text.
 *
 * THIS FILE WRITES NO SANITISER. A hand-written svg element allowlist, or a CSS scanner that
 * re-emits `<style>` text into the svg it then trusts, is the exact shape mutation XSS lives in.
 * DOMPurify's value is the decade of these cases already closed inside it, including the
 * `</style`-in-a-text-node probe and the SVG-namespace confusion checks. What is left here is
 * ours: which profile, what sizing, and the CSSOM narrowing.
 *
 * WHAT IS STILL NOT CONTAINED: mermaid runs IN THIS ORIGIN. Layers 1-4 bound what
 * its output can do, not what a bug in its own parser could do. The strictly stronger answer is a
 * cross-origin sandboxed iframe, where a compromise has no cookies, no API and no DOM to reach.
 * That is the next step if notes ever stop being single-author; it is not taken today because it
 * costs a second build entry and cross-origin font plumbing for a threat layer 1 already keeps off
 * almost every page load.
 */

/**
 * THE CONFIG, and why each line is there.
 *
 * - `USE_PROFILES: { svg: true }` -- the SVG vocabulary and nothing else. Not `svgFilters`: a
 *   diagram has no use for `feImage`/`feDisplacementMap`, and the filter primitives are the part of
 *   SVG with a URL-fetching history. Not `html`: mermaid's svg needs no HTML element once
 *   `htmlLabels` is off, so `<img>`, `<a>` and the rest are simply not in the allowlist. The
 *   profile's own disallowed list already removes `foreignObject`, `use`, `script`, `animate` and
 *   `set` -- which is the second place `htmlLabels: false` is enforced.
 * - `FORBID_TAGS` -- named explicitly even where the profile already refuses them. `a` it does NOT
 *   refuse: an `<a>` is valid SVG, and mermaid's `click` directive emits one. DOMPurify would strip
 *   a `javascript:` target from it and leave an inert link behind, which is harmless and also
 *   pointless -- a diagram in a note is a picture, not navigation -- so the element goes. The other
 *   four are already in the profile's disallowed list; writing them here means a future change to
 *   that list cannot quietly let `htmlLabels` output through. `KEEP_CONTENT` stays at its default,
 *   so a node that was wrapped in a link keeps its shape and its label.
 * - `FORBID_ATTR: ['style']` -- DOMPurify allowlists the `style` ATTRIBUTE without parsing its CSS,
 *   and an inline declaration is the one piece of CSS `scopeDiagramStyles` below cannot narrow,
 *   because it has no selector to anchor. Mermaid's appearance comes from the stylesheet it
 *   generates out of our own theme tokens, so nothing readable is lost. Sizing, which is the other
 *   thing mermaid puts in `style`, is set by us afterwards.
 * - `RETURN_DOM_FRAGMENT` -- see layer 4. The alternative returns a string, and a string has to be
 *   parsed again.
 */
const DIAGRAM_PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] & {
  RETURN_DOM_FRAGMENT: true
} = {
  USE_PROFILES: { svg: true },
  FORBID_TAGS: ['a', 'foreignObject', 'use', 'image', 'script'],
  FORBID_ATTR: ['style'],
  RETURN_DOM_FRAGMENT: true,
}

/** Mermaid's svg string in, a fragment safe to adopt out. */
export function purifyDiagram(svg: string): DocumentFragment {
  return DOMPurify.sanitize(svg, DIAGRAM_PURIFY_CONFIG)
}

/**
 * SIZING, which is ours. Mermaid asks for its width in the `style` attribute the config above
 * drops, so the box is re-stated here in the app's terms: shrink to the pane, but never GROW past
 * the diagram's natural size.
 *
 * The ceiling is read off the `viewBox`, whose user units are CSS pixels at scale 1 -- i.e. the
 * same number mermaid would have written. Without it a three-node flowchart in a 22rem pane was
 * blown up until its labels were larger than the panel's own heading, which is what the first
 * screenshots showed and the only reason this function is more than two lines.
 */
export function sizeDiagram(host: Element): void {
  const svg = host.querySelector('svg')
  if (!svg) return
  const natural = svg.getAttribute('viewBox')?.split(/[\s,]+/)[2]
  svg.setAttribute('width', '100%')
  svg.removeAttribute('height')
  svg.style.maxWidth = natural ? `${natural}px` : '100%'
  svg.style.height = 'auto'
}

/**
 * CSS THAT CANNOT LEAVE THE DIAGRAM -- narrowed through the CSSOM, after DOMPurify.
 *
 * An inline svg's `<style>` is NOT scoped: its rules apply to the whole document. Mermaid prefixes
 * every selector it writes with `#<the diagram's id>`, so its real output is already scoped; this
 * keeps exactly the rules for which that is true and deletes the rest, so a rule that escaped the
 * prefix -- an at-rule, or a `classDef` value that broke out of its declaration block -- cannot
 * reach the page.
 *
 * IT READS PARSED RULES AND DELETES THEM BY INDEX. It does not scan CSS text and it does not write
 * any text back: `deleteRule` operates on the stylesheet the browser already built, so there is no
 * serialise-and-reparse step and therefore no room for the mutation bug that a text-rewriting
 * version of this would have. `url(` goes too -- a background image is how CSS alone still makes a
 * network request.
 *
 * The host must already be IN the document when this runs, because that is when a `<style>`
 * element has a `.sheet`.
 */
export function scopeDiagramStyles(host: Element, id: string): void {
  const anchor = `#${id}`
  for (const el of host.querySelectorAll('style')) {
    const sheet = el.sheet
    if (!sheet) {
      // No stylesheet means the browser could not parse it; an unparsed `<style>` has no effect
      // today but would be a surprise to leave lying in the DOM.
      el.remove()
      continue
    }
    for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) {
      const rule = sheet.cssRules[i]
      // `#id`, `#id ...` and `#id>...` are the three shapes mermaid's own namespacing produces
      // (it rewrites every selector it emits through `compileCSS`); anything else got there another
      // way. A keyframes or media block is not a `CSSStyleRule` and so is not one of them.
      const anchored =
        rule instanceof CSSStyleRule &&
        rule.selectorText.split(',').every((one) => {
          const sel = one.trim()
          return sel === anchor || sel.startsWith(`${anchor} `) || sel.startsWith(`${anchor}>`)
        }) &&
        !rule.style.cssText.includes('url(')
      if (!anchored) sheet.deleteRule(i)
    }
  }
}
