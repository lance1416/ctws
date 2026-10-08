import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CAPTURE_MODULE_ID, captureContributions } from '../modules/registry'
import type { CaptureTarget } from '../modules/contract'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { isBareKey, isTypingTarget } from '../shortcuts/keys'
import { isOverlayOpen } from './overlayState'

/**
 * One input on every page.
 *
 * The destination is no longer "the inbox, obviously": every module that can take a line is asked
 * whether it claims this one, in registration order, and the line falls to the registry's named
 * default when nobody does (module-boundary contract §3). A pasted url goes to 待读; a sentence
 * goes to the inbox.
 *
 * "敲一行字就走" is a success criterion, so routing must not cost a keystroke -- and it does not:
 * `accepts` is a pure function of the line. When the guess is wrong you can SEE it, because
 * 「已放入 X」 names where the line went.
 */
export function QuickCapture() {
  const [title, setTitle] = useState('')
  // WHERE THE LAST LINE LANDED, or null. One line, never a queue. It names the destination but
  // not the title: the title would sit in the DOM of every page (this box is in the layout) and
  // show up twice wherever that task is also listed. It holds the target rather than a boolean
  // because with two modules the destination is no longer always the same place.
  const [landed, setLanded] = useState<CaptureTarget | null>(null)
  const { pathname } = useLocation()
  const shortcuts = useShortcutsEnabled()
  useEffect(() => setLanded(null), [pathname])
  const input = useRef<HTMLInputElement>(null)

  // ONE HOOK PER REGISTERED MODULE, in the registry's frozen order -- which is why the registry
  // says out loud that the list never changes at runtime.
  const contributions = captureContributions()
  const states = contributions.map(({ moduleId, capture }) => ({
    moduleId,
    accepts: capture.accepts,
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length, fixed-order list
    ...capture.useTarget(),
  }))
  const fallback = states.find((s) => s.moduleId === CAPTURE_MODULE_ID)
  if (!fallback) throw new Error(`capture module "${CAPTURE_MODULE_ID}" is not registered`)
  const { missing, unavailable } = fallback

  /** The first module that claims the line and can actually take it; otherwise the default. */
  const routeOf = (line: string): CaptureTarget | null =>
    states.find((s) => s.accepts?.(line) && s.target)?.target ?? fallback.target

  const capture = useMutation({
    mutationFn: async (line: string) => {
      const target = routeOf(line)
      await target!.submit(line)
      return target!
    },
    onSuccess: (target) => {
      setTitle('')
      setLanded(target)
    },
  })

  const submit = () => {
    const t = title.trim()
    if (!t || !routeOf(t) || capture.isPending) return
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
            setLanded(null)
          }}
          onKeyDown={(e) => {
            // isComposing: Enter confirms an IME candidate, it must not submit half a word.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
          placeholder="捕获…"
          disabled={!fallback.target}
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
      {landed && (
        <p role="status" className="w-full truncate text-sm text-fg-muted">
          已放入{' '}
          <Link to={landed.to} className="text-accent underline">
            {landed.name}
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
