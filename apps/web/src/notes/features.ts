import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * WHICH OF THE TWO EXPENSIVE FEATURES A NOTE ACTUALLY USES.
 *
 * D73's second decision: `mermaid` and `katex` load ON DEMAND ONLY. This app is opened twenty
 * times a day and most notes are two lines of prose; a note that contains no diagram and no maths
 * must not pay for the renderers of either. So the source is asked first, and the renderer is
 * fetched afterwards -- which means the answer has to come from a CHEAP, SYNCHRONOUS read of the
 * text, before anything is loaded.
 *
 * IT IS NOT A REGEX. A regex over the source would be a SECOND notion of what counts as maths,
 * living next to `remark-math`'s, and the two would disagree -- a `$5 and $7` line fetching 300 KB
 * of KaTeX for nothing, or a real `$\frac12$` quietly rendering as literal text because the regex
 * missed it. The scan parses with THE SAME `remark-math` the renderer uses, and asks the syntax
 * tree. `remark-math` is the small half of the pair (the micromark extension, no typesetting), so
 * it is affordable in the always-loaded path; `rehype-katex` and `katex` are the expensive half and
 * are the ones held back.
 *
 * `remark-gfm` is in the scanner for the same reason: GFM changes what is a code fence and what is
 * a table cell, so a scanner without it could read a different tree than the renderer does.
 */
export type NoteFeatures = {
  /** The note contains `$...$` or `$$...$$` as `remark-math` understands it. */
  math: boolean
  /** The note contains a fenced block whose info string is `mermaid`. */
  mermaid: boolean
}

/** The info string a fence has to carry to be a diagram. Also what `NoteMarkdown` matches on. */
export const MERMAID_LANG = 'mermaid'

// Parser only -- `.parse()` never runs a transformer, so no rehype, no stringify, no renderer.
const scanner = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

/** The slice of mdast this walk cares about. Everything else is just `children`. */
type ScanNode = { type: string; lang?: string | null; children?: ScanNode[] }

export function noteFeatures(source: string | null | undefined): NoteFeatures {
  const found: NoteFeatures = { math: false, mermaid: false }
  if (!source) return found
  const walk = (node: ScanNode): void => {
    if (node.type === 'math' || node.type === 'inlineMath') found.math = true
    else if (node.type === 'code' && node.lang?.trim().toLowerCase() === MERMAID_LANG)
      found.mermaid = true
    for (const child of node.children ?? []) walk(child)
  }
  walk(scanner.parse(source) as unknown as ScanNode)
  return found
}
