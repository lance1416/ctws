import type { EditorView } from '@codemirror/view'
import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * VIM'S KEYS IN THE EDITOR (REQ-002 FR-112, artboard 36): off unless the account turns them on,
 * never on a phone. The account keeps the choice; this is the page's copy, kept in the browser too
 * so a reload starts as the account was left, every access wrapped as `localStorage` throws in a
 * private window. The keys themselves are fetched the first time an editor needs them.
 */
const KEY = 'ctws.editor.vim'
const EVENT = 'ctws:vim-changed'

/** What this tab was last told, for when `localStorage` cannot hold it. */
let inThisTab = false

function vimKeysOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return inThisTab
  }
}

export function setVimKeys(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // Not remembered across reloads; this tab still honours it.
    inThisTab = on
  }
  window.dispatchEvent(new Event(EVENT))
}

/** The custom event keeps this tab's editors in step; `storage` only fires in other tabs. */
export function useVimKeys(): boolean {
  const [on, setOn] = useState(vimKeysOn)
  useEffect(() => {
    const sync = () => setOn(vimKeysOn())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])
  return on
}

type VimModule = typeof import('@replit/codemirror-vim')
let loaded: Promise<VimModule> | null = null
let ready: VimModule | null = null

/** The keys, fetched once, where an editor first takes them. */
export const loadVim = () => (loaded ??= import('@replit/codemirror-vim').then((m) => (ready = m)))

/** What vim of an editor is doing, if it has vim. */
function vimOf(view: EditorView) {
  return ready?.getCM(view)?.state.vim ?? null
}

/**
 * Where the cursor is in the editor with the focus, as the status bar writes it (artboard 37), with
 * vim's mode when it has vim's keys, and whether it shows the source (FR-116).
 */
export type EditorMode = {
  mode: 'NORMAL' | 'INSERT' | 'VISUAL' | 'REPLACE' | null
  line: number
  column: number
  /** In VISUAL, the lines the selection takes. */
  lines: number
  source: boolean
}

let shown: EditorMode | null = null
/** The editor that has the focus. */
let focused: EditorView | null = null
const heard = new Set<() => void>()
const tell = () => heard.forEach((h) => h())

/** Said by an editor as its cursor or vim's mode moves, and as it takes or loses the focus. */
export function reportMode(view: EditorView, hasFocus: boolean): void {
  if (!hasFocus) {
    // This editor let go of the focus: the bar says nothing for it.
    if (focused === view) {
      focused = null
      if (shown) {
        shown = null
        tell()
      }
    }
    return
  }
  focused = view
  const sel = view.state.selection.main
  const line = view.state.doc.lineAt(sel.head)
  const vim = vimOf(view)
  const next: EditorMode = {
    mode: !vim
      ? null
      : vim.insertMode
        ? 'INSERT'
        : vim.visualMode
          ? 'VISUAL'
          : vim.mode === 'replace'
            ? 'REPLACE'
            : 'NORMAL',
    line: line.number,
    column: sel.head - line.from + 1,
    lines: view.state.doc.lineAt(sel.to).number - view.state.doc.lineAt(sel.from).number + 1,
    source: view.dom.classList.contains('cm-src'),
  }
  if (JSON.stringify(next) !== JSON.stringify(shown)) {
    shown = next
    tell()
  }
}

/** The mode of the editor with the focus, for the status bar; null when none has it (FR-105). */
export function useEditorMode(): EditorMode | null {
  return useSyncExternalStore(
    (h) => {
      heard.add(h)
      return () => heard.delete(h)
    },
    () => shown,
  )
}

/**
 * Whether Esc is vim's own just now: out of INSERT or VISUAL, or a command half typed. Then it
 * goes back to NORMAL and nothing closes; in NORMAL, with nothing typed, it is the page's (FR-029,
 * FR-112). A layer that hears Esc before the editor does (a dialog) asks this first.
 */
export function vimHoldsEscape(view: EditorView | null = focused): boolean {
  const vim = view && vimOf(view)
  if (!vim) return false
  const pending = vim.inputState.keyBuffer.length > 0 || Boolean(vim.inputState.operator)
  return vim.insertMode || vim.visualMode || pending
}

/** Whether vim is in NORMAL with nothing half typed: a j or a k is a plain step. */
export function vimAtRest(view: EditorView): boolean {
  const vim = vimOf(view)
  return Boolean(vim) && !vimHoldsEscape(view)
}

/** Vim's own Esc, as if pressed in the editor: out of INSERT or VISUAL, or a command dropped. */
export function vimEscape(view: EditorView): void {
  const cm = ready?.getCM(view)
  if (cm && ready) ready.Vim.handleKey(cm, '<Esc>', 'user')
}
