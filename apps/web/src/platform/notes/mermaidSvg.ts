import DOMPurify from 'dompurify'

/**
 * Mermaid's svg is untrusted markup: it is sanitised by DOMPurify and adopted as a fragment, never
 * re-serialised, so sanitised text cannot re-parse into different markup (mutation XSS).
 */
const DIAGRAM_PURIFY_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] & {
  RETURN_DOM_FRAGMENT: true
} = {
  // No `svgFilters`: the filter primitives can fetch URLs, and a diagram has no use for them.
  USE_PROFILES: { svg: true },
  // `a` is valid SVG and mermaid's `click` emits one. The rest are already refused by the profile,
  // named again so a change there cannot let `htmlLabels` output through.
  FORBID_TAGS: ['a', 'foreignObject', 'use', 'image', 'script'],
  // An inline declaration has no selector, so `scopeDiagramStyles` could not narrow it.
  FORBID_ATTR: ['style'],
  RETURN_DOM_FRAGMENT: true,
}

/** Mermaid's svg string in, a fragment safe to adopt out. */
export function purifyDiagram(svg: string): DocumentFragment {
  return DOMPurify.sanitize(svg, DIAGRAM_PURIFY_CONFIG)
}

/**
 * Mermaid's own width sits in the `style` attribute the sanitiser drops. Shrink to the pane, but
 * never grow past the viewBox's natural width, or a small diagram's labels outgrow the headings.
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
 * An inline svg's `<style>` applies to the whole document. Keep only rules anchored on mermaid's
 * `#id` prefix and free of `url(`, deleting the rest through the CSSOM so no CSS text is reparsed.
 * The host must already be in the document: only then does a `<style>` have a `.sheet`.
 */
export function scopeDiagramStyles(host: Element, id: string): void {
  const anchor = `#${id}`
  for (const el of host.querySelectorAll('style')) {
    const sheet = el.sheet
    if (!sheet) {
      // The browser could not parse it.
      el.remove()
      continue
    }
    for (let i = sheet.cssRules.length - 1; i >= 0; i -= 1) {
      const rule = sheet.cssRules[i]
      // `#id`, `#id ...` and `#id>...` are the shapes mermaid's namespacing produces; an at-rule
      // is not a `CSSStyleRule` and goes.
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
