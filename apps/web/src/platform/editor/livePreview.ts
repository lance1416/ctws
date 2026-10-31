import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Range, RangeSet, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { mentionOf } from '../notes/mention'
import {
  BulletWidget,
  CheckboxWidget,
  CodeHeadWidget,
  EllipsisWidget,
  MathWidget,
  MentionWidget,
  RuleWidget,
  TableWidget,
} from './widgets'

/**
 * THE LIVE PREVIEW (REQ-002 FR-106, artboard 34): Markdown drawn as it will read, except where the
 * cursor is. On the lines the selection touches every mark shows, in the marks' own small mono;
 * a table, a fenced block or a formula shows its whole source once the cursor is anywhere in it.
 * The text itself never changes size, so nothing jumps as the cursor moves.
 *
 * Built from the document and the selection alone (`previewDecorations`), so what is hidden where
 * can be checked without a browser. A state field, not a view plugin: a table or a formula drawn
 * in place of whole lines is a block, and only state may hold those.
 */

/** A `$$ … $$` block, one paragraph of lines. Markdown's own grammar has no maths. */
const BLOCK_MATH = /^\$\$([\s\S]+?)\$\$$/
/** `$…$` within a line, not `$$`, not a lone price. */
const INLINE_MATH = /(?<![$\\])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$)/g

const hide = Decoration.replace({})
const mark = Decoration.mark({ class: 'cm-md-mark' })
const style = (cls: string) => Decoration.mark({ class: cls })
const line = (cls: string) => Decoration.line({ class: cls })

/** The lines (by number) the selection touches: their marks show. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number
    const to = state.doc.lineAt(r.to).number
    for (let n = from; n <= to; n++) lines.add(n)
  }
  return lines
}

/** Whether the selection is anywhere from `from` to `to`, ends included: a block shows its source. */
const touches = (state: EditorState, from: number, to: number) =>
  state.selection.ranges.some((r) => r.to >= from && r.from <= to)

export function previewDecorations(state: EditorState): Range<Decoration>[] {
  const out: Range<Decoration>[] = []
  const active = activeLines(state)
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number)
  const doc = state.doc
  // Ranges already drawn as a block: nothing inside them is decorated again.
  const blocks: { from: number; to: number }[] = []
  const inBlock = (pos: number) => blocks.some((b) => pos >= b.from && pos <= b.to)

  // Maths blocks first: a `$$` paragraph is a paragraph to Markdown, and would be decorated as one.
  syntaxTree(state).iterate({
    enter: (n) => {
      if (n.name !== 'Paragraph') return
      const text = doc.sliceString(n.from, n.to)
      const m = BLOCK_MATH.exec(text)
      if (!m) return false
      blocks.push({ from: n.from, to: n.to })
      if (!touches(state, n.from, n.to))
        out.push(
          Decoration.replace({ widget: new MathWidget(m[1]!.trim(), true), block: true }).range(
            n.from,
            n.to,
          ),
        )
      else for (const l of linesOf(state, n.from, n.to)) out.push(line('cm-md-source').range(l))
      return false
    },
  })

  syntaxTree(state).iterate({
    enter: (n) => {
      if (inBlock(n.from)) return false
      switch (n.name) {
        case 'ATXHeading1':
        case 'ATXHeading2':
          out.push(line('cm-md-h2').range(doc.lineAt(n.from).from))
          return
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6':
          out.push(line('cm-md-h3').range(doc.lineAt(n.from).from))
          return
        case 'HeaderMark': {
          // The space after `##` goes with it, so the heading starts at the margin.
          const to = Math.min(n.to + 1, doc.lineAt(n.from).to)
          out.push((isActive(n.from) ? mark : hide).range(n.from, isActive(n.from) ? n.to : to))
          return
        }
        case 'Emphasis':
          out.push(style('cm-md-em').range(n.from, n.to))
          return
        case 'StrongEmphasis':
          out.push(style('cm-md-strong').range(n.from, n.to))
          return
        case 'Strikethrough':
          out.push(style('cm-md-del').range(n.from, n.to))
          return
        case 'InlineCode':
          out.push(style('cm-md-code').range(n.from, n.to))
          return
        case 'EmphasisMark':
        case 'StrikethroughMark':
        case 'CodeMark':
          // A fence's backticks are the block's, below.
          if (n.node.parent?.name === 'FencedCode') return
          out.push((isActive(n.from) ? mark : hide).range(n.from, n.to))
          return
        case 'Link':
          link(state, n.node, isActive(n.from), out)
          return false
        case 'Task':
          return
        case 'ListMark': {
          const item = n.node.parent
          const task = item?.getChild('Task')
          const marker = task?.getChild('TaskMarker')
          if (marker) {
            const done = /x/i.test(doc.sliceString(marker.from, marker.to))
            const lineFrom = doc.lineAt(n.from).from
            if (done) out.push(line('cm-md-done').range(lineFrom))
            if (isActive(n.from)) {
              out.push(mark.range(n.from, n.to), mark.range(marker.from, marker.to))
            } else {
              // `- [ ] `: the mark, the box and the space after it are the box.
              const to = Math.min(marker.to + 1, doc.lineAt(marker.from).to)
              out.push(Decoration.replace({ widget: new CheckboxWidget(done) }).range(n.from, to))
            }
            return
          }
          const ordered = item?.parent?.name === 'OrderedList'
          if (isActive(n.from) || ordered) out.push(mark.range(n.from, n.to))
          else out.push(Decoration.replace({ widget: new BulletWidget() }).range(n.from, n.to))
          return
        }
        case 'Blockquote':
          for (const l of linesOf(state, n.from, n.to)) out.push(line('cm-md-quote').range(l))
          return
        case 'QuoteMark': {
          const to = Math.min(n.to + 1, doc.lineAt(n.from).to)
          out.push((isActive(n.from) ? mark : hide).range(n.from, isActive(n.from) ? n.to : to))
          return
        }
        case 'HorizontalRule':
          if (!isActive(n.from))
            out.push(Decoration.replace({ widget: new RuleWidget() }).range(n.from, n.to))
          else out.push(mark.range(n.from, n.to))
          return
        case 'FencedCode':
          fence(state, n.node, out)
          return false
        case 'Table': {
          // Whole lines: the grammar's table starts after the first row's `|`.
          const from = doc.lineAt(n.from).from
          const to = doc.lineAt(n.to).to
          blocks.push({ from, to })
          if (!touches(state, from, to))
            out.push(
              Decoration.replace({ widget: TableWidget.of(state, n.node), block: true }).range(
                from,
                to,
              ),
            )
          else for (const l of linesOf(state, from, to)) out.push(line('cm-md-source').range(l))
          return false
        }
        default:
          return
      }
    },
  })

  // Inline maths, on the lines whose marks are hidden.
  for (let n = 1; n <= doc.lines; n++) {
    if (active.has(n)) continue
    const l = doc.line(n)
    if (inBlock(l.from)) continue
    for (const m of l.text.matchAll(INLINE_MATH)) {
      const from = l.from + m.index
      if (insideCode(state, from)) continue
      out.push(
        Decoration.replace({ widget: new MathWidget(m[1]!, false) }).range(
          from,
          from + m[0].length,
        ),
      )
    }
  }
  return out
}

/** Every line's start from `from` to `to`, for a line decoration on each. */
function linesOf(state: EditorState, from: number, to: number): number[] {
  const starts: number[] = []
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++)
    starts.push(state.doc.line(n).from)
  return starts
}

/** Within code, where `$` is a dollar. */
function insideCode(state: EditorState, pos: number): boolean {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent)
    if (n.name === 'InlineCode' || n.name === 'FencedCode' || n.name === 'CodeBlock') return true
  return false
}

/**
 * `[words](address)`: a mention a chip, its words, or the words with their marks; any other link
 * underlined words, its address shown on the cursor's line, cut short.
 */
function link(state: EditorState, node: SyntaxNode, active: boolean, out: Range<Decoration>[]) {
  const doc = state.doc
  const marks = node.getChildren('LinkMark')
  const url = node.getChild('URL')
  const open = marks[0]
  const close = marks[1]
  if (!open || !close || !url) return
  const address = doc.sliceString(url.from, url.to)
  const mention = mentionOf(address)
  const words = doc.sliceString(open.to, close.from)
  if (mention) {
    if (!active) {
      out.push(
        Decoration.replace({ widget: new MentionWidget(mention.type, mention.id, words) }).range(
          node.from,
          node.to,
        ),
      )
      return
    }
    // On the cursor's line the words alone, as they were typed: its address is nobody's to read.
    out.push(hide.range(node.from, open.to), style('cm-md-mention').range(open.to, close.from))
    out.push(hide.range(close.from, node.to))
    return
  }
  out.push(style('cm-md-link').range(open.to, close.from))
  if (!active) {
    out.push(hide.range(node.from, open.to), hide.range(close.from, node.to))
    return
  }
  out.push(mark.range(node.from, open.to), mark.range(close.from, node.to))
  // The address past its scheme is long and nobody reads it while writing: `https://…`, until the
  // cursor is in it.
  const scheme = /^[a-z]+:\/\//i.exec(address)?.[0].length ?? 0
  const cursorIn = touches(state, url.from, url.to)
  if (!cursorIn && address.length - scheme > 1)
    out.push(Decoration.replace({ widget: new EllipsisWidget() }).range(url.from + scheme, url.to))
}

/** A fenced block: its code in mono; its fences a head with the language and Copy, until entered. */
function fence(state: EditorState, node: SyntaxNode, out: Range<Decoration>[]) {
  const doc = state.doc
  const first = doc.lineAt(node.from)
  const last = doc.lineAt(node.to)
  const entered = touches(state, node.from, node.to)
  for (const l of linesOf(state, node.from, node.to)) out.push(line('cm-md-codeline').range(l))
  out.push(line('cm-md-codefirst').range(first.from))
  // The closing fence goes, line and all, until the block is entered; the block ends above it.
  const closed = last.number > first.number && /^\s*(```|~~~)/.test(last.text)
  const end = closed && !entered ? doc.line(last.number - 1) : last
  out.push(line('cm-md-codelast').range(end.from))
  if (entered) return
  const info = node.getChild('CodeInfo')
  const lang = info ? doc.sliceString(info.from, info.to) : ''
  const text = node.getChild('CodeText')
  const code = text ? doc.sliceString(text.from, text.to) : ''
  out.push(
    Decoration.replace({ widget: new CodeHeadWidget(lang, code) }).range(first.from, first.to),
  )
  if (closed) out.push(Decoration.replace({ block: true }).range(last.from, last.to))
}

type Preview = { all: DecorationSet; atomic: DecorationSet }

function preview(state: EditorState): Preview {
  const ranges = previewDecorations(state)
  return {
    all: RangeSet.of(ranges, true),
    // Only what is drawn in place of text is one thing to the cursor: styled words stay words.
    atomic: RangeSet.of(
      ranges.filter((r) => r.value.point && r.from < r.to),
      true,
    ),
  }
}

/** The preview's decorations, redrawn when the text, the cursor or the parse moves on. */
export const livePreview = StateField.define<Preview>({
  create: preview,
  update(value, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.state) !== syntaxTree(tr.startState))
      return preview(tr.state)
    return value
  },
  provide: (field) => [
    EditorView.decorations.from(field, (p) => p.all),
    // A chip or a box is one thing to the cursor: it steps over it and deletes it whole.
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
})
