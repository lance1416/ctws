import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { EditorSelection, type StateCommand } from '@codemirror/state'
import { EditorView, type KeyBinding } from '@codemirror/view'

/**
 * Wraps each selection in `marker`, or takes it off where it is already there: Ctrl B is `**`,
 * Ctrl I `*` (REQ-002 FR-107). An empty selection gets the pair with the cursor between.
 */
const toggleWrap =
  (marker: string): StateCommand =>
  ({ state, dispatch }) => {
    const n = marker.length
    const tr = state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - n, range.from)
      const after = state.sliceDoc(range.to, range.to + n)
      if (before === marker && after === marker)
        return {
          changes: [
            { from: range.from - n, to: range.from },
            { from: range.to, to: range.to + n },
          ],
          range: EditorSelection.range(range.from - n, range.to - n),
        }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + n, range.to + n),
      }
    })
    dispatch(state.update(tr, { userEvent: 'input.format' }))
    return true
  }

/**
 * Ctrl Shift K (FR-029, REQ-002 §5): the selection becomes a link's words, the cursor where the
 * address goes; with nothing selected, `[]()` with the cursor in the words.
 */
const insertLink: StateCommand = ({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const words = state.sliceDoc(range.from, range.to)
    const insert = `[${words}]()`
    const cursor = words ? range.from + insert.length - 1 : range.from + 1
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(cursor),
    }
  })
  dispatch(state.update(tr, { userEvent: 'input.format' }))
  return true
}

/** On a table's row, Tab goes to the start of the next cell, and from the last to the next row. */
const nextCell: StateCommand = ({ state, dispatch }) => {
  const head = state.selection.main.head
  const line = state.doc.lineAt(head)
  if (!/^\s*\|.*\|\s*$/.test(line.text)) return false
  const bar = line.text.indexOf('|', head - line.from)
  let target: number | null = null
  // The next `|` that opens a cell on this line, else the next row's first cell.
  if (bar !== -1 && bar < line.text.trimEnd().length - 1) target = line.from + bar + 1
  else if (line.number < state.doc.lines) {
    let next = state.doc.line(line.number + 1)
    // Past the `---` row under the head.
    if (/^\s*\|?\s*:?-+/.test(next.text) && next.number < state.doc.lines)
      next = state.doc.line(next.number + 1)
    if (/^\s*\|/.test(next.text)) target = next.from + next.text.indexOf('|') + 1
  }
  if (target === null) return false
  const space = state.sliceDoc(target, target + 1) === ' ' ? 1 : 0
  dispatch(
    state.update({ selection: EditorSelection.cursor(target + space), scrollIntoView: true }),
  )
  return true
}

/** A web address pasted over selected words makes them its link (REQ-002 FR-107). */
export const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData('text/plain').trim() ?? ''
    const range = view.state.selection.main
    if (range.empty || !/^https?:\/\/\S+$/.test(text)) return false
    const words = view.state.sliceDoc(range.from, range.to)
    if (words.includes('\n')) return false
    event.preventDefault()
    const insert = `[${words}](${text})`
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(range.from + insert.length),
      userEvent: 'input.paste',
    })
    return true
  },
})

/**
 * The editor's keys. CodeMirror's own, less Shift-Mod-k (delete the line), which is the link key
 * here; Ctrl K is never bound, so it stays the app's search (FR-029).
 */
export const editorKeys: readonly KeyBinding[] = [
  { key: 'Mod-b', run: toggleWrap('**') },
  { key: 'Mod-i', run: toggleWrap('*') },
  { key: 'Shift-Mod-k', run: insertLink },
  { key: 'Tab', run: nextCell },
  ...defaultKeymap.filter((b) => b.key !== 'Shift-Mod-k'),
  ...historyKeymap,
]

export { history }
