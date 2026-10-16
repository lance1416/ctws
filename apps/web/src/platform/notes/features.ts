import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

/**
 * Which on-demand renderers a note needs, answered before any is loaded. It parses with the same
 * `remark-math` and `remark-gfm` the renderer uses, because a regex would disagree with them.
 */
type NoteFeatures = {
  /** `$...$` or `$$...$$`, as `remark-math` reads it. */
  math: boolean
  mermaid: boolean
  /** A fence with any other language on it. */
  highlight: boolean
}

export const MERMAID_LANG = 'mermaid'

// Parser only: `.parse()` never runs a transformer.
const scanner = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

type ScanNode = { type: string; lang?: string | null; children?: ScanNode[] }

export function noteFeatures(source: string | null | undefined): NoteFeatures {
  const found: NoteFeatures = { math: false, mermaid: false, highlight: false }
  if (!source) return found
  const walk = (node: ScanNode): void => {
    if (node.type === 'math' || node.type === 'inlineMath') found.math = true
    else if (node.type === 'code') {
      const lang = node.lang?.trim().toLowerCase()
      // A fence with no language stays plain: highlight.js would guess.
      if (lang === MERMAID_LANG) found.mermaid = true
      else if (lang) found.highlight = true
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(scanner.parse(source) as unknown as ScanNode)
  return found
}
