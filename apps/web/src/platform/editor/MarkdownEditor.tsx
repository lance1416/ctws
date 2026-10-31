import type { ObjectType } from '@ctws/contracts'
import { mentionAddress } from '@ctws/core'
import {
  autocompletion,
  closeCompletion,
  completionStatus,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { Compartment, EditorState, Prec, StateEffect, StateField } from '@codemirror/state'
import { drawSelection, EditorView, keymap, placeholder as placeholderText } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { undo } from '@codemirror/commands'
import { editorKeys, history, insertLink, pasteLink, toggleLineMark } from './commands'
import { find, findDone, findInNote, type Found, findStep } from './find'
import { livePreview, stepIntoBlock } from './livePreview'
import { isNoteKey } from './noteKeys'
import { sourceView } from './sourceView'
import { type EditorAction, type FocusedEditor, holdFocus, passOn, releaseFocus } from './focused'
import { loadVim, reportMode, useVimKeys, vimAtRest, vimEscape, vimHoldsEscape } from './vim'
import { usePhone } from '../ui/phone'
import { mentionDisplay, type MentionDisplay } from './widgets'
import './editor.css'

/** One thing `@` offers: what it is, the words it is written with, and its kind's heading. */
export type MentionOption = { type: ObjectType; id: string; title: string; section: string }

export type EditorMentions = MentionDisplay & {
  /** What `@query` finds, in the order the app ranks it (FR-024). */
  search: (query: string) => Promise<readonly MentionOption[]>
  /** A row's mark in the list: the kind's icon, a person's initials. */
  mark: (option: MentionOption) => HTMLElement
}

/** What a page may do to the editor it holds: the outline's jump to a heading. */
export type EditorHandle = {
  /** The cursor to `offset` in the text, scrolled to near the top, the editor focused. */
  goTo: (offset: number) => void
  /** Ctrl F's bar (FR-109): finds the words, steps through them, and is done. */
  find: (query: string) => Found
  findStep: (step: 1 | -1) => Found
  findDone: () => void
  /** The phone's buttons over the keyboard (FR-113), on the text where the cursor is. */
  act: (action: EditorAction) => void
  /** Where in the text the top of what shows of the editor is: the outline's section in sight. */
  inSight: () => number
}

const LINE_ACTIONS = {
  heading: toggleLineMark('## '),
  list: toggleLineMark('- '),
  task: toggleLineMark('- [ ] '),
  link: insertLink,
} as const

/** The highlighting of code inside a fence, in the colours the reading side uses. */
const codeColours = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier], class: 'cm-code-keyword' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], class: 'cm-code-string' },
  // Not `atom`: Markdown tags a task's `[ ]` with it, and a mark is the marks' own grey.
  { tag: [tags.number, tags.bool, tags.null], class: 'cm-code-number' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], class: 'cm-code-comment' },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
    class: 'cm-code-fn',
  },
  { tag: [tags.attributeName, tags.propertyName, tags.typeName], class: 'cm-code-attr' },
  { tag: [tags.punctuation, tags.bracket], class: 'cm-code-punct' },
])

/** An `@` that starts a word, and what has been typed after it to the cursor: as the text box. */
const MENTION_QUERY = /(?:^|[\s([{（，。,;；:：])@[^\s@]{1,40}$/u

/** Which thing each offered row stands for, for its mark in the list. */
const optionOf = new WeakMap<Completion, MentionOption>()

/**
 * The `@` whose list Esc put away (FR-042): it stays away for those words, as in the text box; a
 * new `@` asks again. Its place moves with the text written before it.
 */
const putAway = StateEffect.define<number>()
const awayAt = StateField.define<number | null>({
  create: () => null,
  update: (at, tr) => {
    for (const e of tr.effects) if (e.is(putAway)) return e.value
    return at === null ? null : tr.changes.mapPos(at, -1, 1)
  },
})

/** The `@` before the cursor that starts a mention being typed, if there is one. */
const mentionStart = (context: { matchBefore: CompletionContext['matchBefore'] }) => {
  const typed = context.matchBefore(MENTION_QUERY)
  // The match may start at the space before the `@`.
  return typed ? typed.from + typed.text.indexOf('@') : null
}

/** Esc on an open list: noted, so the list stays away; the list's own Esc then closes it. */
const putAwayKey = Prec.highest(
  keymap.of([
    {
      key: 'Escape',
      run: (view) => {
        if (completionStatus(view.state) !== 'active') return false
        const head = view.state.selection.main.head
        const line = view.state.doc.lineAt(head)
        const typed = MENTION_QUERY.exec(line.text.slice(0, head - line.from))
        if (typed) {
          const at = line.from + typed.index + typed[0].indexOf('@')
          view.dispatch({ effects: putAway.of(at) })
        }
        return false
      },
    },
  ]),
)

function mentionSource(mentions: EditorMentions) {
  // No `@` being typed is said at once, not as a promise: a pending list would take the next Esc
  // to close it, and vim's Esc out of INSERT with it.
  return (context: CompletionContext): Promise<CompletionResult | null> | null => {
    const from = mentionStart(context)
    if (from === null || context.state.field(awayAt, false) === from) return null
    return offered(mentions, context, from)
  }
}

async function offered(
  mentions: EditorMentions,
  context: CompletionContext,
  from: number,
): Promise<CompletionResult | null> {
  const found = await mentions.search(context.state.sliceDoc(from + 1, context.pos))
  if (context.aborted) return null
  // Each kind's heading ranked where search puts it (FR-024): a name alone, CodeMirror would
  // sort them by their letters, Communications before People (BUG-097).
  const sections = new Map<string, { name: string; rank: number }>()
  for (const o of found)
    if (!sections.has(o.section)) sections.set(o.section, { name: o.section, rank: sections.size })
  return {
    from,
    filter: false,
    options: found.map((o) => {
      const completion: Completion = {
        label: o.title,
        section: sections.get(o.section)!,
        type: o.type,
        // Stored as notes store a mention, a space after it as the text box gave one; drawn as
        // its chip once the cursor leaves the line.
        apply: `[@${o.title}](${mentionAddress(o.type, o.id)}) `,
      }
      optionOf.set(completion, o)
      return completion
    }),
  }
}

/**
 * THE ONE MARKDOWN EDITOR (REQ-002 FR-106): CodeMirror 6 with the live preview, the app's keys and
 * `@`. The value is the note as stored, mentions and all: nothing is translated on the way in or
 * out. Loaded only where writing starts (`LazyMarkdownEditor`), never where a note is read.
 */
export default function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  autoFocus = false,
  mentions,
  className = '',
  boxed = false,
  handle,
  onCursor,
  onFind,
  onEscape,
  takeOver,
  source = false,
}: {
  value: string
  onChange: (next: string) => void
  /** Its name to a screen reader: what is written here. */
  label: string
  placeholder?: string
  autoFocus?: boolean
  mentions?: EditorMentions
  className?: string
  /** In a field's box (a task's notes): the box takes the app's focus ring. */
  boxed?: boolean
  /** Filled while the editor is on the page. */
  handle?: RefObject<EditorHandle | null>
  /** Where the cursor is, as it moves: the outline's current section. */
  onCursor?: (offset: number) => void
  /** Ctrl F in the editor, where the page has a find bar; elsewhere it is the browser's. */
  onFind?: () => void
  /** Esc, where it puts the editor away (a meeting's notes); the `@` list's own Esc comes first. */
  onEscape?: () => void
  /** Where the box it replaces had its caret, when it had the focus: the editor takes over there. */
  takeOver?: RefObject<number | null>
  /** The note as it is kept, every mark shown, nothing drawn (FR-116); else the live preview. */
  source?: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange
  // What this editor has said its text is, since a value last came from outside: the page's
  // answer may come back a keystroke late, and an echo is not news.
  const written = useRef(new Set<string>())
  const moved = useRef(onCursor)
  moved.current = onCursor
  const finds = useRef(onFind)
  finds.current = onFind
  const escapes = useRef(onEscape)
  escapes.current = onEscape
  // Vim's keys, when the account has them and this is not a phone (FR-112): in their own slot.
  const vimKeys = useVimKeys()
  const phone = usePhone()
  const vimOn = vimKeys && !phone
  const [vimSlot] = useState(() => new Compartment())
  // The live preview, or the source in its place (FR-116).
  const [lookSlot] = useState(() => new Compartment())
  const sourceAt = useRef(source)

  /** Ctrl F, where the page has a find bar; the browser's otherwise. */
  const findKey = {
    key: 'Mod-f',
    run: () => {
      if (!finds.current) return false
      finds.current()
      return true
    },
  }

  /** This editor as the page reaches it while it has the focus (`useFocusedEditor`). */
  const [asFocused] = useState<FocusedEditor>(() => ({
    // Its Esc, for a layer that hears it first: its `@` list closed, or vim back to NORMAL;
    // anything else is the layer's.
    escape: () => {
      const v = view.current
      if (!v) return false
      if (completionStatus(v.state)) {
        closeCompletion(v)
        return true
      }
      if (!vimHoldsEscape(v)) return false
      vimEscape(v)
      return true
    },
    act: function act(action) {
      const v = view.current
      if (!v) return
      // An IME still composing: the words chosen first, then the button, after them (BUG-102).
      if (v.composing) {
        v.contentDOM.addEventListener('compositionend', () => setTimeout(() => act(action)), {
          once: true,
        })
        return
      }
      if (action === 'undo') undo(v)
      else if (action === 'mention') {
        // An `@` that starts a word, so its list opens.
        const { from } = v.state.selection.main
        const before = v.state.sliceDoc(Math.max(0, from - 1), from)
        v.dispatch(v.state.replaceSelection(before === '' || /\s/.test(before) ? '@' : ' @'))
        startCompletion(v)
      } else LINE_ACTIONS[action](v)
      v.focus()
    },
  }))

  // Made in the same commit that takes the stand-in away, before the browser can hand on another
  // key: a key pressed between the two went to nothing, and was lost.
  useLayoutEffect(() => {
    const extensions = [
      vimSlot.of([]),
      // The selection drawn by the editor, in the app's select colour: vim hides the browser's
      // own, and VISUAL would show nothing.
      drawSelection(),
      history(),
      keymap.of([
        findKey,
        {
          key: 'Escape',
          // Not while vim holds it: its Esc is back to NORMAL first (FR-112).
          run: (v) => {
            if (!escapes.current || vimHoldsEscape(v)) return false
            escapes.current()
            return true
          },
        },
        ...editorKeys,
      ]),
      findInNote,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(codeColours),
      lookSlot.of(sourceAt.current ? sourceView : livePreview),
      pasteLink,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          const text = u.state.doc.toString()
          written.current.add(text)
          changed.current(text)
        }
        if (u.docChanged || u.selectionSet) moved.current?.(u.state.selection.main.head)
        if (u.selectionSet || u.focusChanged) reportMode(u.view, u.view.hasFocus)
        if (u.focusChanged) (u.view.hasFocus ? holdFocus : releaseFocus)(asFocused)
      }),
    ]
    if (placeholder) extensions.push(placeholderText(placeholder))
    if (mentions)
      extensions.push(
        mentionDisplay.of(mentions),
        awayAt,
        putAwayKey,
        autocompletion({
          override: [mentionSource(mentions)],
          icons: false,
          addToOptions: [
            {
              render: (completion) => {
                const option = optionOf.get(completion)
                return option ? mentions.mark(option) : null
              },
              position: 20,
            },
          ],
        }),
      )
    // The stand-in's caret, taken once: let go a moment later, as a remount in React's strict
    // mode comes straight after and takes it too.
    const given = takeOver?.current ?? null
    if (takeOver && given !== null) setTimeout(() => (takeOver.current = null))
    const created = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions,
        ...(given !== null ? { selection: { anchor: Math.min(given, value.length) } } : {}),
      }),
    })
    view.current = created
    if (handle)
      handle.current = {
        goTo: (offset) => {
          const at = Math.min(offset, created.state.doc.length)
          created.dispatch({
            selection: { anchor: at },
            effects: EditorView.scrollIntoView(at, { y: 'start', yMargin: 24 }),
          })
          created.focus()
        },
        find: (query) => find(created, query),
        findStep: (step) => findStep(created, step),
        findDone: () => findDone(created),
        act: asFocused.act,
        inSight: () => {
          const box = created.dom.getBoundingClientRect()
          const shown = scrollerOf(created.dom)?.getBoundingClientRect().top ?? 0
          const y = Math.min(Math.max(box.top, shown) + 1, box.bottom - 1)
          return created.lineBlockAtHeight(y - created.documentTop).from
        },
      }
    // Arrived late (its code is fetched on first use), it takes the focus only if nothing has it
    // since: a menu opened meanwhile stays open.
    // So does focus on what is behind the layer the editor is in (full screen): it cannot be used.
    const active = document.activeElement
    const layer = host.current?.closest('[role="dialog"]')
    const free =
      active === null || active === document.body || (layer != null && !layer.contains(active))
    if ((autoFocus || given !== null) && free) {
      created.focus()
      // Taken over in the middle of an `@`: the box's list went with the box; this one asks again.
      if (given !== null && mentions && completionStatus(created.state) === null)
        startCompletion(created)
    }
    return () => {
      reportMode(created, false)
      releaseFocus(asFocused)
      created.destroy()
      view.current = null
      if (handle) handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view per mount; `value` follows below.
  }, [])

  // The source and the drawn note swapped, the cursor where it was in the text and its line kept
  // at the height it was on the screen: the page scrolls by however far the line moved.
  useEffect(() => {
    const v = view.current
    if (!v || sourceAt.current === source) return
    sourceAt.current = source
    const head = v.state.selection.main.head
    const before = v.coordsAtPos(head)?.top
    v.dispatch({ effects: lookSlot.reconfigure(source ? sourceView : livePreview) })
    reportMode(v, v.hasFocus)
    v.requestMeasure({
      read: () => v.coordsAtPos(head)?.top,
      write: (after) => {
        if (before === undefined || after === undefined || after === before) return
        scrollerOf(v.dom)?.scrollBy({ top: after - before })
      },
    })
  }, [source, lookSlot])

  // Vim's keys taken on or off; fetched the first time they are wanted.
  useEffect(() => {
    const v = view.current
    if (!v) return
    if (!vimOn) {
      v.dispatch({ effects: vimSlot.reconfigure([]) })
      reportMode(v, false)
      return
    }
    let gone = false
    void loadVim().then(({ vim, getCM }) => {
      const at = view.current
      if (gone || !at) return
      at.dispatch({
        effects: vimSlot.reconfigure([
          // Ahead of vim's own: Esc in NORMAL is the page's, and Ctrl F and Ctrl Shift K stay
          // the editor's, not vim's paging (artboard 34, "Vim, when it is on").
          Prec.highest([
            EditorView.domEventHandlers({
              keydown: (e, editor) => {
                // Ctrl K is search everywhere (FR-029), never vim's: passed on untouched.
                const mod = e.ctrlKey || e.metaKey
                // So are the note page's own (the outline, the source): never vim's Ctrl V.
                if (isNoteKey(e)) {
                  passOn(e)
                  return true
                }
                if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
                  passOn(e)
                  return true
                }
                // j and k into a block drawn whole, as the arrows go: vim steps over it.
                if ((e.key === 'j' || e.key === 'k') && !mod && !e.altKey && vimAtRest(editor))
                  return stepIntoBlock(editor, e.key === 'j' ? 1 : -1)
                if (e.key !== 'Escape') return false
                // A list about to be asked for (CodeMirror waits a beat after each key) would take
                // a quick Esc; in INSERT that Esc is vim's.
                if (completionStatus(editor.state) === 'pending') closeCompletion(editor)
                if (vimHoldsEscape(editor)) return false
                if (completionStatus(editor.state)) return false
                if (escapes.current) {
                  escapes.current()
                  e.preventDefault()
                }
                // Not the editor's: it goes on to the pane or layer around it, which closes.
                passOn(e)
                return true
              },
            }),
            keymap.of([findKey, { key: 'Shift-Mod-k', run: insertLink }]),
          ]),
          vim(),
        ]),
      })
      getCM(at)?.on('vim-mode-change', () => reportMode(at, at.hasFocus))
      reportMode(at, at.hasFocus)
    })
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the slot and its keys are this editor's.
  }, [vimOn])

  // A value from outside (a save's answer, another tab) replaces the text when it differs.
  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === value || written.current.has(value)) return
    written.current.clear()
    // A cursor at the end stays at the end (the first words typed before the editor arrived);
    // anywhere else it keeps its place, as far as the new text goes.
    const { head } = v.state.selection.main
    const atEnd = head === v.state.doc.length
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: value },
      selection: { anchor: atEnd ? value.length : Math.min(head, value.length) },
    })
    // Written in the box it replaced and arriving a beat late: an `@` being typed asks again.
    // Only when no list is open: asking again restarts one, and its guard against a quick Enter.
    if (v.hasFocus && mentions && completionStatus(v.state) === null) startCompletion(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run for a new value only.
  }, [value])

  return (
    <div
      ref={host}
      data-markdown-editor
      {...(boxed ? { 'data-boxed': '' } : {})}
      className={className}
    />
  )
}

/** The box that scrolls the editor: the nearest one round it that can. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(at).overflowY)) return at
  }
  return document.scrollingElement as HTMLElement | null
}
