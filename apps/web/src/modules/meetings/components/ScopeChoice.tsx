import type { MeetingOccurrence } from '@ctws/contracts'
import { useEffect, useRef, useState } from 'react'
import { shortDay, weekdayOf } from '../../../platform/time/dates'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { LAYER } from '../../../platform/ui/layers'
import { useAccountToday } from '../../../shell/auth'
import type { EditScope } from '../api'

/**
 * "This meeting repeats. Change which?" (FR-068, artboard 16): asked when Edit is pressed on a
 * repeating meeting, before anything is changed. This one, by its date; this one and every one
 * after, the earlier ones left as they were; or the whole series, since it began.
 */
export function ScopeChoice({
  meeting: m,
  firstDay,
  onPick,
  onCancel,
}: {
  meeting: MeetingOccurrence
  /** The day the series began, for "Since Sep 11". */
  firstDay: string | null
  onPick: (scope: EditScope) => void
  onCancel: () => void
}) {
  const today = useAccountToday()
  const [scope, setScope] = useState<EditScope>('one')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => box.current?.querySelector<HTMLInputElement>('input:checked')?.focus(), [])
  const day = m.startsLocal.slice(0, 10)
  const choices: { value: EditScope; label: string; note: string }[] = [
    {
      value: 'one',
      label: 'Only this one',
      note: `${weekdayOf(day, true)}, ${shortDay(day, today)}`,
    },
    {
      value: 'following',
      label: 'This one and every one after',
      note: 'Earlier ones stay as they were',
    },
    {
      value: 'all',
      label: 'The whole series',
      note: firstDay ? `Since ${shortDay(firstDay, today)}` : 'Every one of them',
    },
  ]
  return (
    <div
      ref={box}
      role="dialog"
      aria-label="This meeting repeats. Change which?"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      className={`absolute top-full right-0 ${LAYER.menu} mt-2 flex w-92 flex-col gap-2 rounded-block bg-float p-3.5 shadow-float`}
    >
      <p className="text-ui font-medium text-ink">This meeting repeats. Change which?</p>
      <div role="radiogroup" aria-label="Change which" className="flex flex-col gap-1">
        {choices.map((c) => (
          <label
            key={c.value}
            className="flex cursor-pointer items-start gap-3 rounded-control px-3 py-2 has-[:checked]:bg-select hover:bg-hover"
          >
            <input
              type="radio"
              name="scope"
              value={c.value}
              checked={scope === c.value}
              onChange={() => setScope(c.value)}
              className="mt-1 size-4 accent-ink"
            />
            <span className="flex flex-col">
              <span className="text-ui text-ink">{c.label}</span>
              <span className="text-meta text-muted">{c.note}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={BUTTON.quiet}>
          Cancel
        </button>
        <button type="button" onClick={() => onPick(scope)} className={BUTTON.primary}>
          Edit
        </button>
      </div>
    </div>
  )
}
