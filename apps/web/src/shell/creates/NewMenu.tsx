import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BUTTON, KEY, KEY_ON_INK } from '../../platform/ui/buttonStyles'
import { KIND_ICON, NewIcon } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import type { Creator } from '../contract'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { useRegistry } from '../registry'
import { menuOrder, recentKinds } from './recent'

/**
 * How the frame opens a creator, for the menu, the `N` keys and the blocks' `+`. What is made
 * stays on the page it was made from, unless `opens`: its module's own sidebar or page (FR-026).
 */
/** How a New was asked for: whether its page opens once made, and the day it is for, from a calendar. */
export type NewHow = { opens: boolean; day?: string }

export const NewContext = createContext<(creator: Creator, how?: NewHow) => void>(() => {})
const useOpenNew = () => useContext(NewContext)

/**
 * THE NEW MENU (FR-026, artboard 9): on a project's page, the kinds that can belong to it; the few
 * used lately shown, the rest found by typing, so the menu never grows. What it makes belongs to
 * the project. `N` then a key does the same from anywhere.
 */
export function NewMenu({
  projectName,
  className = '',
}: {
  projectName: string
  className?: string
}) {
  const registry = useRegistry()
  const openNew = useOpenNew()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [at, setAt] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const { shown, hidden } = menuOrder(registry.creates, open ? recentKinds() : [], typed)
  const pick = (creator: Creator) => {
    setOpen(false)
    setTyped('')
    // The form it opens hands focus back to what had it: New, not the item about to go.
    trigger.current?.focus()
    openNew(creator)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAt(Math.min(at + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAt(Math.max(at - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const creator = shown[Math.min(at, shown.length - 1)]
      if (creator) pick(creator)
    }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={BUTTON.primary}
      >
        <NewIcon size={16} aria-hidden="true" />
        New
        <kbd className={KEY_ON_INK}>N</kbd>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={`New in ${projectName}`}
          onKeyDown={onKeyDown}
          className={`absolute top-full right-0 ${LAYER.menu} mt-1.5 flex w-95 flex-col rounded-block bg-float pb-1.5 shadow-float`}
        >
          <label className="flex h-11 items-center gap-2.5 border-b border-line px-3 text-muted">
            <NewIcon size={16} aria-hidden="true" />
            <input
              ref={input}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setAt(0)
              }}
              placeholder={`New in ${projectName}`}
              aria-label="What to make"
              data-bare
              className="min-w-0 flex-1 bg-transparent text-ui text-ink placeholder:text-muted"
            />
          </label>
          {!typed && shown.length > 0 && (
            <div className="px-4 pt-2 pb-1 text-meta font-medium tracking-[0.06em] text-subtle uppercase">
              Recent
            </div>
          )}
          {shown.map((creator, i) => {
            const Icon = KIND_ICON[creator.kind]
            return (
              <button
                key={creator.kind}
                type="button"
                role="menuitem"
                onClick={() => pick(creator)}
                onMouseEnter={() => setAt(i)}
                className={`mx-1.5 grid h-9 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-control px-2 text-ui text-ink ${
                  i === at ? 'bg-select' : 'hover:bg-hover'
                }`}
              >
                <Icon size={16} aria-hidden="true" className={KIND_TEXT[creator.kind]} />
                <span className="text-left">{creator.label}</span>
                <kbd className={KEY}>N {creator.key.toUpperCase()}</kbd>
              </button>
            )
          })}
          {typed && shown.length === 0 && (
            <p className="px-4 py-2 text-ui text-muted">Nothing called “{typed.trim()}”.</p>
          )}
          {hidden.length > 0 && (
            <p className="px-4 pt-2 pb-1 text-meta text-subtle">
              Type to find the rest: {hidden.map((c) => c.label.toLocaleLowerCase()).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
