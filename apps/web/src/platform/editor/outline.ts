/** One heading of a note, as its outline lists it. */
export type Heading = {
  /** Its words, without its marks. */
  words: string
  /** 1 for `#` and `##`, the note's sections; 2 for `###` and below, under them. */
  depth: 1 | 2
  /** Where its line starts in the text, for the jump to it. */
  offset: number
}

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * A NOTE'S OUTLINE (REQ-002 FR-109, artboard 34): its `#` headings in order, those inside a code
 * fence left out. The editor draws `#` and `##` alike, at the note's biggest step, so they are one
 * depth here too.
 */
export function outlineOf(text: string): Heading[] {
  const out: Heading[] = []
  let fence: string | null = null
  let offset = 0
  for (const line of text.split('\n')) {
    const opens = FENCE.exec(line)?.[1]
    if (fence) {
      if (opens && opens[0] === fence[0] && opens.length >= fence.length) fence = null
    } else if (opens) fence = opens
    else {
      const m = ATX.exec(line)
      const words = m?.[2]?.replace(/[*_`~]/g, '').trim()
      if (m && words) out.push({ words, depth: m[1]!.length <= 2 ? 1 : 2, offset })
    }
    offset += line.length + 1
  }
  return out
}

/** The heading whose section holds `offset`: the last at or before it; none above the first. */
export function sectionAt(headings: readonly Heading[], offset: number): Heading | null {
  let at: Heading | null = null
  for (const h of headings) {
    if (h.offset > offset) break
    at = h
  }
  return at
}
