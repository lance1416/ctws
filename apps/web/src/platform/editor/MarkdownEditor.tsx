import type { ObjectType } from '@ctws/contracts'
import { mentionAddress } from '@ctws/core'
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder as placeholderText } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { type RefObject, useEffect, useRef } from 'react'
import { editorKeys, history, pasteLink } from './commands'
import { find, findDone, findInNote, type Found, findStep } from './find'
import { livePreview } from './livePreview'
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
}

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

function mentionSource(mentions: EditorMentions) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const typed = context.matchBefore(MENTION_QUERY)
    if (!typed) return null
    // The match may start at the space before the `@`.
    const from = typed.from + typed.text.indexOf('@')
    const found = await mentions.search(context.state.sliceDoc(from + 1, context.pos))
    if (context.aborted) return null
    // Each kind's heading ranked where search puts it (FR-024): a name alone, CodeMirror would
    // sort them by their letters, Communications before People (BUG-097).
    const sections = new Map<string, { name: string; rank: number }>()
    for (const o of found)
      if (!sections.has(o.section))
        sections.set(o.section, { name: o.section, rank: sections.size })
    return {
      from,
      filter: false,
      options: found.map((o) => {
        const completion: Completion = {
          label: o.title,
          section: sections.get(o.section)!,
          type: o.type,
          // Stored as notes store a mention; drawn as its chip once the cursor leaves the line.
          apply: `[@${o.title}](${mentionAddress(o.type, o.id)})`,
        }
        optionOf.set(completion, o)
        return completion
      }),
    }
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
  handle,
  onCursor,
  onFind,
}: {
  value: string
  onChange: (next: string) => void
  /** Its name to a screen reader: what is written here. */
  label: string
  placeholder?: string
  autoFocus?: boolean
  mentions?: EditorMentions
  className?: string
  /** Filled while the editor is on the page. */
  handle?: RefObject<EditorHandle | null>
  /** Where the cursor is, as it moves: the outline's current section. */
  onCursor?: (offset: number) => void
  /** Ctrl F in the editor, where the page has a find bar; elsewhere it is the browser's. */
  onFind?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange
  const moved = useRef(onCursor)
  moved.current = onCursor
  const finds = useRef(onFind)
  finds.current = onFind

  useEffect(() => {
    const extensions = [
      history(),
      keymap.of([
        {
          key: 'Mod-f',
          run: () => {
            if (!finds.current) return false
            finds.current()
            return true
          },
        },
        ...editorKeys,
      ]),
      findInNote,
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(codeColours),
      livePreview,
      pasteLink,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true' }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) changed.current(u.state.doc.toString())
        if (u.docChanged || u.selectionSet) moved.current?.(u.state.selection.main.head)
      }),
    ]
    if (placeholder) extensions.push(placeholderText(placeholder))
    if (mentions)
      extensions.push(
        mentionDisplay.of(mentions),
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
    const created = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: value, extensions }),
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
      }
    // Arrived late (its code is fetched on first use), it takes the focus only if nothing has it
    // since: a menu opened meanwhile stays open.
    const free = document.activeElement === null || document.activeElement === document.body
    if (autoFocus && free) created.focus()
    return () => {
      created.destroy()
      view.current = null
      if (handle) handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one view per mount; `value` follows below.
  }, [])

  // A value from outside (a save's answer, another tab) replaces the text when it differs.
  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  return <div ref={host} data-markdown-editor className={className} />
}
