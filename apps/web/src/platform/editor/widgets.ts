import type { ObjectType } from '@ctws/contracts'
import { type EditorState, Facet } from '@codemirror/state'
import { type EditorView, WidgetType } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

/**
 * How a mention is drawn and what a press on it does, given by whoever puts the editor on a page
 * (the shell knows each kind's mark and the inspector; the editor does not). Without one, a
 * mention is its words.
 */
export type MentionDisplay = {
  /** The chip, which opens what it names when pressed. */
  draw: (type: ObjectType, id: string, words: string) => HTMLElement
  /** A chip the editor has taken down. */
  release: (el: HTMLElement) => void
}
export const mentionDisplay = Facet.define<MentionDisplay, MentionDisplay | null>({
  combine: (values) => values[0] ?? null,
})

/** Stops a press from moving the cursor onto what was pressed. */
const keepCursor = (el: HTMLElement) => el.addEventListener('mousedown', (e) => e.preventDefault())

/** `- [ ]` drawn as the box it is; a press ticks or unticks it where it is in the text. */
export class CheckboxWidget extends WidgetType {
  constructor(readonly done: boolean) {
    super()
  }
  override eq(other: CheckboxWidget) {
    return other.done === this.done
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.done
    box.className = 'cm-md-task'
    box.setAttribute('aria-label', this.done ? 'Done' : 'Not done')
    keepCursor(box)
    box.addEventListener('click', (e) => {
      e.preventDefault()
      const line = view.state.doc.lineAt(view.posAtDOM(box))
      const at = /\[( |x|X)\]/.exec(line.text)
      if (!at) return
      const pos = line.from + at.index + 1
      view.dispatch({ changes: { from: pos, to: pos + 1, insert: this.done ? ' ' : 'x' } })
    })
    return box
  }
  override ignoreEvent() {
    return true
  }
}

/** A bullet where `-` is. */
export class BulletWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const dot = document.createElement('span')
    dot.className = 'cm-md-bullet'
    dot.textContent = '•'
    return dot
  }
}

/** `---` as the rule it is. */
export class RuleWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const hr = document.createElement('span')
    hr.className = 'cm-md-rule'
    return hr
  }
}

/** What stands for an address cut short. */
export class EllipsisWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-md-mark'
    s.textContent = '…'
    return s
  }
}

/**
 * KaTeX, fetched the first time a formula is drawn: a note with no maths never loads it, as the
 * reading side does not (notes.spec, "no chunk a plain note loads contains KaTeX").
 */
let katexLoaded: Promise<typeof import('katex').default> | null = null
const loadKatex = () =>
  (katexLoaded ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([k]) => k.default,
  ))

/** A formula drawn by KaTeX, inline or on its own lines; never trusted with HTML or links. */
export class MathWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly display: boolean,
  ) {
    super()
  }
  override eq(other: MathWidget) {
    return other.source === this.source && other.display === this.display
  }
  toDOM() {
    const el = document.createElement(this.display ? 'div' : 'span')
    el.className = this.display ? 'cm-md-math-block' : 'cm-md-math'
    // Its source until KaTeX has arrived: the words are there, just not drawn yet.
    el.textContent = this.source
    void loadKatex().then((katex) =>
      katex.render(this.source, el, {
        throwOnError: false,
        displayMode: this.display,
        trust: false,
      }),
    )
    return el
  }
}

/** A mention as a chip, drawn by the page's `mentionDisplay`, which opens what it names. */
export class MentionWidget extends WidgetType {
  constructor(
    readonly type: ObjectType,
    readonly id: string,
    readonly words: string,
  ) {
    super()
  }
  override eq(other: MentionWidget) {
    return other.id === this.id && other.words === this.words
  }
  toDOM(view: EditorView) {
    const display = view.state.facet(mentionDisplay)
    // `@Mira Chen`, as the link's words are and the reader's chip takes them.
    const chip = display?.draw(this.type, this.id, this.words) ?? document.createElement('span')
    if (!display) chip.textContent = this.words
    chip.classList.add('cm-md-chip')
    chip.dataset.mention = `${this.type}:${this.id}`
    keepCursor(chip)
    if (display) released.set(chip, display.release)
    return chip
  }
  override destroy(dom: HTMLElement) {
    released.get(dom)?.(dom)
  }
  override ignoreEvent() {
    // A press is the chip's own: it opens what it names.
    return true
  }
}

/** Who to tell when a chip goes. */
const released = new WeakMap<HTMLElement, (el: HTMLElement) => void>()

/** A fence's head: its language, and Copy for the code under it. */
export class CodeHeadWidget extends WidgetType {
  constructor(
    readonly lang: string,
    readonly code: string,
  ) {
    super()
  }
  override eq(other: CodeHeadWidget) {
    return other.lang === this.lang && other.code === this.code
  }
  toDOM() {
    const head = document.createElement('span')
    head.className = 'cm-md-codehead'
    const lang = document.createElement('span')
    lang.textContent = this.lang
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.textContent = 'Copy'
    copy.className = 'cm-md-copy'
    keepCursor(copy)
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.code).then(() => {
        copy.textContent = 'Copied'
        setTimeout(() => (copy.textContent = 'Copy'), 1500)
      })
    })
    head.append(lang, copy)
    return head
  }
  override ignoreEvent(e: Event) {
    // The button is the head's; a press anywhere else enters the block to edit it.
    return (e.target as HTMLElement | null)?.closest('button') !== null
  }
}

/** A cell's words as they read: the marks around them gone, a mention its words. */
const cellWords = (source: string) =>
  source
    .trim()
    .replace(/\[(@?[^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')

/** A table drawn as its grid, its figures lined up; a press enters it to show the source. */
export class TableWidget extends WidgetType {
  constructor(readonly rows: readonly (readonly string[])[]) {
    super()
  }
  static of(state: EditorState, node: SyntaxNode): TableWidget {
    const rows: string[][] = []
    for (let row = node.firstChild; row; row = row.nextSibling) {
      if (row.name !== 'TableHeader' && row.name !== 'TableRow') continue
      rows.push(row.getChildren('TableCell').map((c) => cellWords(state.sliceDoc(c.from, c.to))))
    }
    return new TableWidget(rows)
  }
  override eq(other: TableWidget) {
    return JSON.stringify(other.rows) === JSON.stringify(this.rows)
  }
  toDOM() {
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    this.rows.forEach((cells, i) => {
      const tr = document.createElement('tr')
      for (const words of cells) {
        const cell = document.createElement(i === 0 ? 'th' : 'td')
        cell.textContent = words
        tr.append(cell)
      }
      table.append(tr)
    })
    return table
  }
}
