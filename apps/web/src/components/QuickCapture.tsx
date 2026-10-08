import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { captureContribution } from '../modules/registry'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { isBareKey, isTypingTarget } from '../shortcuts/keys'
import { isOverlayOpen } from './overlayState'

/**
 * One input on every page.
 *
 * The destination is no longer "the inbox, obviously": it is whichever module the registry names
 * as the default capture target, and that module resolves its own destination (module-boundary
 * contract §3). With one module the line still lands in the inbox and nothing is asked of the
 * typist -- which is the point. "敲一行字就走" is a success criterion, so naming the destination
 * must not cost a keystroke, and it does not: the default is explicit in the registry, not chosen
 * at the keyboard.
 */
export function QuickCapture() {
  const [title, setTitle] = useState('')
  // Set when a capture lands; cleared by the next keystroke or navigation. One line, never a
  // queue. It names the destination but not the title: the title would sit in the DOM of every
  // page (this box is in the layout) and show up twice wherever that task is also listed.
  const [landed, setLanded] = useState(false)
  const { pathname } = useLocation()
  const shortcuts = useShortcutsEnabled()
  useEffect(() => setLanded(false), [pathname])
  const input = useRef<HTMLInputElement>(null)
  const { target, missing, unavailable } = captureContribution().useTarget()

  const capture = useMutation({
    mutationFn: (t: string) => target!.submit(t),
    onSuccess: () => {
      setTitle('')
      setLanded(true)
    },
  })

  const submit = () => {
    const t = title.trim()
    if (!t || !target || capture.isPending) return
    capture.mutate(t)
  }

  // `/` jumps to the capture box from anywhere that is not already a text field. The guard is
  // now shared with the other document-level keys (`f`, `?`, the `g` chords) rather than
  // duplicated, and it also stands down while an overlay owns the keyboard.
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || !isBareKey(e)) return
      if (isTypingTarget(e.target) || isOverlayOpen()) return
      e.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <>
      {/* At the top of the rail: the first thing in the column you make things from. */}
      <div className="relative w-full min-w-0">
        {/* The rail, at the same fixed x position the project rails use, so the bar reads as
            part of the same system rather than a floating search box. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent"
        />
        <input
          ref={input}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setLanded(false)
          }}
          onKeyDown={(e) => {
            // isComposing: Enter confirms an IME candidate, it must not submit half a word.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
          placeholder="捕获…"
          disabled={!target}
          aria-label="捕获"
          className="h-9 w-full rounded-lg border border-border-strong bg-surface-panel pr-8 pl-3 text-sm text-fg placeholder:text-fg-muted disabled:opacity-50"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border-subtle px-1 text-xs leading-5 text-fg-subtle"
        >
          /
        </kbd>
      </div>
      {missing && (
        <p role="alert" className="w-full text-sm text-danger">
          没有找到收件箱，无法捕获
        </p>
      )}
      {/* role="status", not "alert": on the projects page the list already raises its own alert
          for the same failed fetch, and two alerts would be announced (and matched) twice. */}
      {unavailable && (
        <p role="status" className="w-full text-sm text-danger">
          暂时读不到收件箱
        </p>
      )}
      {landed && target && (
        <p role="status" className="w-full truncate text-sm text-fg-muted">
          已放入{' '}
          <Link to={target.to} className="text-accent underline">
            {target.name}
          </Link>
        </p>
      )}
      {capture.isError && (
        <p role="alert" className="w-full text-sm text-danger">
          没能保存，再按一次回车重试
        </p>
      )}
    </>
  )
}
