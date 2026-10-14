import { LINK } from '../../platform/ui/buttonStyles'
import { KeyHint } from '../../platform/ui/KeyHint'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useRegistry } from '../registry'
import type { CaptureTarget } from '../contract'
import { useShortcutsEnabled } from '../../platform/keyboard/enabled'
import { isBareKey, isTypingTarget } from '../../platform/keyboard/keys'
import { isOverlayOpen } from '../../platform/keyboard/overlayState'
import { useInlineEdit } from '../../platform/ui/useInlineEdit'
import { textbox } from '../../platform/ui/formStyles'
import { LAYER } from '../../platform/ui/layers'

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

  // One hook per module that captures; the registry's list is fixed, so the hook order is too.
  const registry = useRegistry()
  const states = registry.captures.map(({ moduleId, capture }) => ({
    moduleId,
    accepts: capture.accepts,
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length, fixed-order list
    ...capture.useTarget(),
  }))
  const fallback = states.find((s) => s.moduleId === registry.captureModuleId)!
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
  const lineKeys = useInlineEdit({ onCommit: submit })

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
          {...lineKeys}
          placeholder="Capture…"
          disabled={!fallback.target}
          aria-label="Capture"
          className={`w-full bg-sheet pr-8 disabled:opacity-50 ${textbox}`}
        />
        <KeyHint
          hidden
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-rule px-1 text-xs leading-5 text-ink-subtle"
        >
          /
        </KeyHint>
      </div>
      {/* Under the box, right-aligned to it. Below 640 the box is too near the left edge for that:
          a long project name would run off the screen, so the message spans the width under the
          header instead. */}
      <div
        className={`absolute top-full right-0 ${LAYER.cover} mt-1 flex w-max max-w-[20rem] flex-col empty:hidden max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none`}
      >
        {missing && (
          <p
            role="alert"
            className="rounded-[10px] bg-float px-3 py-1.5 text-sm text-danger shadow-float"
          >
            No inbox to capture into
          </p>
        )}
        {/* role="status", not "alert": on the projects page the list already raises its own alert
          for the same failed fetch, and two alerts would be announced (and matched) twice. */}
        {unavailable && (
          <p
            role="status"
            className="rounded-[10px] bg-float px-3 py-1.5 text-sm text-danger shadow-float"
          >
            Inbox unavailable
          </p>
        )}
        {landed && (
          <p
            role="status"
            className="truncate rounded-[10px] bg-float px-3 py-1.5 text-sm text-ink-muted shadow-float"
          >
            Added to{' '}
            <Link to={landed.to} className={LINK}>
              {landed.name}
            </Link>
          </p>
        )}
        {capture.isError && (
          <p
            role="alert"
            className="rounded-[10px] bg-float px-3 py-1.5 text-sm text-danger shadow-float"
          >
            Couldn't save. Press Enter to try again.
          </p>
        )}
      </div>
    </div>
  )
}
