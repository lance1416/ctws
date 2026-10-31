import { type EditorState, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'

/** Where the words are found, and which of them is the one the bar is on. */
export type Found = { count: number; index: number }

type Finding = { query: string; at: readonly number[]; index: number }

const NONE: Finding = { query: '', at: [], index: -1 }
const setFinding = StateEffect.define<Finding>()

/** Every place `query` is in the text, case aside. */
function placesOf(state: EditorState, query: string): number[] {
  if (!query) return []
  const text = state.doc.toString().toLowerCase()
  const q = query.toLowerCase()
  const at: number[] = []
  for (let i = text.indexOf(q); i !== -1; i = text.indexOf(q, i + q.length)) at.push(i)
  return at
}

/**
 * FIND IN THIS NOTE (REQ-002 FR-109, artboard 34): every place the words are, marked, the one the
 * bar is on marked darker. Its own marks, not the selection's: the bar keeps the focus, and an
 * editor without it draws no selection.
 */
export const findInNote = StateField.define<Finding>({
  create: () => NONE,
  update(was, tr) {
    for (const e of tr.effects) if (e.is(setFinding)) return e.value
    if (!tr.docChanged || !was.query) return was
    // Typed while finding: the places move with the text.
    const at = placesOf(tr.state, was.query)
    return { query: was.query, at, index: Math.min(was.index, at.length - 1) }
  },
  provide: (field) =>
    EditorView.decorations.from(field, (f): DecorationSet => {
      const length = f.query.length
      return Decoration.set(
        f.at.map((from, i) =>
          Decoration.mark({ class: i === f.index ? 'cm-md-found-here' : 'cm-md-found' }).range(
            from,
            from + length,
          ),
        ),
      )
    }),
})

/** The bar's index on the place `step` away from where it is, round the ends. */
function stepTo(f: Finding, step: number): number {
  if (f.at.length === 0) return -1
  return (f.index + step + f.at.length) % f.at.length
}

function show(view: EditorView, f: Finding): Found {
  const from = f.at[f.index]
  view.dispatch({
    effects: [
      setFinding.of(f),
      ...(from === undefined ? [] : [EditorView.scrollIntoView(from, { y: 'center' })]),
    ],
  })
  return { count: f.at.length, index: f.index }
}

/** Finds `query`, on the first place at or after the cursor. */
export function find(view: EditorView, query: string): Found {
  const at = placesOf(view.state, query)
  const head = view.state.selection.main.from
  const first = at.findIndex((p) => p >= head)
  return show(view, { query, at, index: at.length === 0 ? -1 : first === -1 ? 0 : first })
}

/** The next place (1) or the one before (-1). */
export function findStep(view: EditorView, step: 1 | -1): Found {
  const f = view.state.field(findInNote)
  return show(view, { ...f, index: stepTo(f, step) })
}

/** Done finding: the marks go, the cursor on the place the bar was on. */
export function findDone(view: EditorView): void {
  const f = view.state.field(findInNote)
  const from = f.at[f.index]
  view.dispatch({
    effects: setFinding.of(NONE),
    ...(from === undefined ? {} : { selection: { anchor: from, head: from + f.query.length } }),
  })
  view.focus()
}
