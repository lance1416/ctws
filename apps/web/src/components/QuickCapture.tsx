import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CAPTURE_MODULE_ID, captureContributions } from '../modules/registry'
import type { CaptureTarget } from '../modules/contract'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { isBareKey, isTypingTarget } from '../shortcuts/keys'
import { isOverlayOpen } from './overlayState'
import { useComposing } from '../composition'
import { textbox } from './formStyles'

/**
 * One input on every page, in the header: the same place on every page and at every width.
 *
 * THE DESTINATION IS NOT ALWAYS THE INBOX: every module that can take a line is asked whether it
 * claims this one, in registration order, and the line falls to the registry's named default when
 * nobody does. A pasted url goes to Reading; a sentence goes to the inbox.
 *
 * Typing a line and leaving is a success criterion, so routing must not cost a keystroke -- and it
 * does not: `accepts` is a pure function of the line. When the guess is wrong you can SEE it,
 * because the confirmation names where the line went.
 */
export function QuickCapture() {
  const composing = useComposing()
  const [title, setTitle] = useState('')
  // WHERE THE LAST LINE LANDED, or null. One line, never a queue. It names the destination but
  // not the title: the title would sit in the DOM of every page (this box is in the layout) and
  // show up twice wherever that task is also listed. It holds the target rather than a boolean
  // because with two modules the destination is not always the same place.
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
    // The answer to a line pops under the box, so typing never moves anything in the header.
    <div className="relative w-28 min-w-0 shrink sm:w-60">
      <div className="relative">
        <input
          ref={input}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setLanded(null)
          }}
          {...composing.bind}
          onKeyDown={(e) => {
            // isComposing: Enter confirms an IME candidate, it must not submit half a word.
            if (e.key === 'Enter' && !composing.composingNow(e)) submit()
          }}
          placeholder="Capture…"
          disabled={!fallback.target}
          aria-label="Capture"
          className={`w-full bg-surface-panel pr-8 disabled:opacity-50 ${textbox}`}
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border-subtle px-1 text-xs leading-5 text-fg-subtle"
        >
          /
        </kbd>
      </div>
      <div className="absolute top-full right-0 z-40 mt-1 flex w-max max-w-[20rem] flex-col empty:hidden">
        {missing && (
          <p
            role="alert"
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-sm text-danger shadow-panel"
          >
            No inbox to capture into
          </p>
        )}
        {/* role="status", not "alert": on the projects page the list already raises its own alert
          for the same failed fetch, and two alerts would be announced (and matched) twice. */}
        {unavailable && (
          <p
            role="status"
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-sm text-danger shadow-panel"
          >
            Inbox unavailable
          </p>
        )}
        {landed && (
          <p
            role="status"
            className="truncate rounded-lg bg-surface-raised px-3 py-1.5 text-sm text-fg-muted shadow-panel"
          >
            Added to{' '}
            <Link to={landed.to} className="text-accent underline">
              {landed.name}
            </Link>
          </p>
        )}
        {capture.isError && (
          <p
            role="alert"
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-sm text-danger shadow-panel"
          >
            Couldn't save. Press Enter to try again.
          </p>
        )}
      </div>
    </div>
  )
}
