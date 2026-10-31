import { syntaxTree } from '@codemirror/language'
import { type EditorState, type Range, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, highlightActiveLine } from '@codemirror/view'
import { mentionOf } from '../notes/mention'

/** What Markdown writes to mark something up: shown, in the marks' grey. */
const MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'ListMark',
  'QuoteMark',
  'TaskMarker',
  'StrikethroughMark',
  'URL',
])

const mark = Decoration.mark({ class: 'cm-src-mark' })
const heading = Decoration.line({ class: 'cm-src-heading' })
const linked = Decoration.mark({ class: 'cm-src-link' })
const mentioned = Decoration.mark({ class: 'cm-src-mention' })

function decorations(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (/^ATXHeading\d$/.test(node.name)) {
        out.push(heading.range(state.doc.lineAt(node.from).from))
      } else if (node.name === 'Link') {
        // `[words](address)`: the words a mention's or a link's colour, the rest marks.
        const marks = node.node.getChildren('LinkMark')
        const url = node.node.getChild('URL')
        const [open, close] = marks
        if (open && close && open.to < close.from) {
          const address = url ? state.sliceDoc(url.from, url.to) : ''
          out.push((mentionOf(address) ? mentioned : linked).range(open.to, close.from))
        }
      } else if (MARKS.has(node.name) && node.from < node.to) {
        out.push(mark.range(node.from, node.to))
      }
    },
  })
  return Decoration.set(out, true)
}

const sourceMarks = StateField.define<DecorationSet>({
  create: decorations,
  update: (value, tr) =>
    tr.docChanged || syntaxTree(tr.state) !== syntaxTree(tr.startState)
      ? decorations(tr.state)
      : value,
  provide: (field) => EditorView.decorations.from(field),
})

/**
 * THE SOURCE (REQ-002 FR-116, artboard 39): the note as it is kept, every mark shown and nothing
 * drawn, in mono, the whole note at once so no line moves on its own. Written in the same way;
 * what the live preview would draw (a chip, a box, a table) is its own text here.
 */
export const sourceView = [
  sourceMarks,
  highlightActiveLine(),
  EditorView.editorAttributes.of({ class: 'cm-src' }),
]
