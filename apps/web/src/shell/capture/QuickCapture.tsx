import { LINK } from '../../platform/ui/buttonStyles'
import { KeyHint } from '../../platform/ui/KeyHint'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useRegistry } from '../registry'
import type { CaptureTarget } from '../contract'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { useLineEntry } from '../../platform/ui/useLineEntry'
import { textbox } from '../../platform/ui/formStyles'
import { LAYER } from '../../platform/ui/layers'

/**
 * The capture box in the header. The first module that claims the line takes it (a pasted url
 * goes to Reading), else the registry's default; the confirmation names where it went.
 */
export function QuickCapture() {
  const line = useLineEntry()
  // Where the last line landed, and the page it was said on: another page has moved on. Not its
  // title: this box is on every page, so the title would show twice wherever that task is listed.
  const [said, setLanded] = useState<{ target: CaptureTarget; on: string } | null>(null)
  const { pathname } = useLocation()
  const landed = said?.on === pathname ? said.target : null
  const input = useRef<HTMLInputElement>(null)

  // One hook per module that captures; the registry's list is fixed, so the hook order is too.
  const registry = useRegistry()
  const states = registry.captures.map(({ moduleId, capture }) => ({
    moduleId,
    accepts: capture.accepts,
    ...capture.useTarget(),
  }))
  const fallback = states.find((s) => s.moduleId === registry.captureModuleId)!
  const { missing, unavailable } = fallback

  /** The first module that claims the line and can actually take it; otherwise the default. */
  const routeOf = (line: string): CaptureTarget | null =>
    states.find((s) => s.accepts?.(line) && s.target)?.target ?? fallback.target

  const send = line.sends(async (text) => {
    const target = routeOf(text)
    await target!.submit(text)
    return target!
  })
  const capture = useMutation({
    mutationFn: send,
    // `submit` refreshes the lists that now hold the line itself.
    meta: { refresh: false, ownsError: true },
    onSuccess: (target) => setLanded({ target, on: pathname }),
  })

  useDocumentKeys(registry.anywhere, { capture: () => input.current?.focus() })

  return (
    // Messages pop under the box, so typing never moves anything in the header.
    <div className="relative w-28 min-w-0 shrink sm:w-60">
      <div className="relative">
        <input
          ref={input}
          {...line.field({
            onSubmit: (text) => {
              if (routeOf(text)) capture.mutate(text)
            },
            busy: capture.isPending,
          })}
          onChange={(e) => {
            line.setValue(e.target.value)
            setLanded(null)
          }}
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
      {/* Below 640 a long project name would run off the screen, so the message spans the width
          under the header instead. */}
      <div
        className={`absolute top-full right-0 ${LAYER.cover} mt-1 flex w-max max-w-[20rem] flex-col empty:hidden max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:mt-0 max-sm:w-auto max-sm:max-w-none`}
      >
        {missing && (
          <p
            role="alert"
            className="rounded-[10px] bg-float px-3 py-1.5 text-sm text-danger shadow-float"
          >
            {missing}
          </p>
        )}
        {/* `status`, not `alert`: the projects page already alerts on the same failure. */}
        {unavailable && (
          <p
            role="status"
            className="rounded-[10px] bg-float px-3 py-1.5 text-sm text-danger shadow-float"
          >
            {unavailable}
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
