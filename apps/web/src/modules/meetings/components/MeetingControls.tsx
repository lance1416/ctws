import type { PersonId } from '@ctws/contracts'
import { usePeople } from '../../people'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { PickMany, PickOne } from '../../../platform/ui/inline'
import { useNow } from '../../../platform/time/useNow'
import { repeatChoices, repeatLabel } from '../api'
import { cityAndZone, ZONES } from '../logic/timeZones'

// Bare controls shared by New meeting and the pane's form; label and layout are the caller's.

/** How long a meeting is, as a person says it: `1 h`, `45 min`. */
export function lengthLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`
}

const LENGTHS = [15, 30, 45, 60, 90, 120]

export function LengthPicker({
  value,
  onPick,
}: {
  value: number
  onPick: (minutes: number) => void
}) {
  return (
    <PickOne
      label="Length"
      value={String(value)}
      choices={LENGTHS.map((m) => ({ value: String(m), label: lengthLabel(m) }))}
      onPick={(m) => onPick(Number(m))}
    />
  )
}

/** The meeting's zone, not the reader's; the menu names each by the abbreviation it uses now. */
export function ZonePicker({ value, onPick }: { value: string; onPick: (zone: string) => void }) {
  const now = useNow()
  return (
    <PickOne
      label="Time zone"
      value={value}
      choices={ZONES.map((z) => ({ value: z, label: cityAndZone(now, z) }))}
      onPick={onPick}
    />
  )
}

/** `PickOne` has no null value, so "does not repeat" needs a value of its own. */
const NO_REPEAT = '__none'

/** How it repeats, named after the day `startsLocal` falls on. */
export function RepeatPicker({
  startsLocal,
  today,
  value,
  stored = false,
  onPick,
}: {
  startsLocal: string
  today: string
  /** The rule without its ending, or null for once. */
  value: string | null
  /** A saved meeting's value, which may be a rule the menu does not offer; it stays a choice. */
  stored?: boolean
  onPick: (rule: string | null) => void
}) {
  const choices = repeatChoices(startsLocal)
  const kept = stored && value !== null && !choices.some((c) => c.value === value)
  return (
    <PickOne
      label="Repeats"
      value={value ?? NO_REPEAT}
      choices={[
        ...choices.map((c) => ({ value: c.value ?? NO_REPEAT, label: c.label })),
        ...(kept ? [{ value, label: repeatLabel(value, startsLocal, today) }] : []),
      ]}
      onPick={(v) => onPick(v === NO_REPEAT ? null : v)}
    />
  )
}

/** The day a repeat stops on, or Never. The input is named by the caller: an id or a label. */
export function EndsPicker({
  until,
  min,
  onChange,
  id,
  label,
  className,
}: {
  until: string | null
  min: string
  onChange: (day: string | null) => void
  id?: string
  label?: string
  className: string
}) {
  return (
    <>
      <input
        id={id}
        type="date"
        aria-label={label}
        value={until ?? ''}
        min={min}
        onChange={(e) => onChange(e.target.value || null)}
        className={className}
      />
      {until ? (
        <button type="button" onClick={() => onChange(null)} className={BUTTON.inline}>
          Never
        </button>
      ) : (
        <span className="text-sm text-ink-subtle">Never</span>
      )}
    </>
  )
}

export function AttendeesPicker({
  value,
  onChange,
}: {
  value: PersonId[]
  onChange: (ids: PersonId[]) => void
}) {
  const people = usePeople().data ?? []
  return (
    <PickMany
      label="Attendees"
      chosen={value.map((id) => ({
        value: id,
        label: people.find((p) => p.id === id)?.name ?? '',
      }))}
      choices={people.map((p) => ({ value: p.id, label: p.name }))}
      onChange={onChange}
      empty="Nobody yet"
    />
  )
}
