/** One unticked item of a Markdown checklist: its line, from 0, and its words. */
export type OpenItem = { line: number; text: string }

// `- [ ] words`, with `*` or `+` for the dash, indented or not, and an ordered `1.` too.
const ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s+)(.*\S)\s*$/
const FENCE = /^\s*(```|~~~)/

/** Each line, with whether it sits inside a fenced code block, where a `[ ]` is only text. */
function* lines(body: string): Generator<{ at: number; line: string; code: boolean }> {
  let fence: string | null = null
  const all = body.split('\n')
  for (const [at, line] of all.entries()) {
    const opens = FENCE.exec(line)?.[1]
    if (fence === null && opens) {
      fence = opens
      yield { at, line, code: true }
      continue
    }
    if (fence !== null) {
      if (line.trim().startsWith(fence)) fence = null
      yield { at, line, code: true }
      continue
    }
    yield { at, line, code: false }
  }
}

/** The checklist items of `body` not yet ticked, in order. */
export function openItems(body: string): OpenItem[] {
  const out: OpenItem[] = []
  for (const { at, line, code } of lines(body)) {
    if (code) continue
    const m = ITEM.exec(line)
    if (m && m[2] === ' ') out.push({ line: at, text: m[4]! })
  }
  return out
}

/**
 * `body` with one item ticked: the unticked one at `line` when its words are still `text`, else
 * the one unticked item with those words, wherever an edit since has moved it. Null when there is
 * no such item, or more than one and none of them at `line`: guessing could tick the wrong one.
 */
export function tickItem(body: string, item: OpenItem): string | null {
  const open = openItems(body).filter((o) => o.text === item.text)
  const target = open.find((o) => o.line === item.line) ?? (open.length === 1 ? open[0] : null)
  if (!target) return null
  const all = body.split('\n')
  all[target.line] = all[target.line]!.replace(
    ITEM,
    (_, a: string, _box, b: string, words: string) => `${a}x${b}${words}`,
  )
  return all.join('\n')
}
