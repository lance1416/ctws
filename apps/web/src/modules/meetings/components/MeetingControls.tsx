import { usePeople } from '../../people'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { PickMany, PickOne } from '../../../platform/ui/inline'
import { useNow } from '../../../platform/time/useNow'
import { repeatChoices, repeatLabel } from '../api'
import { ZONES, zoneLabel } from '../timeZones'

/*
 * THE CONTROLS NEW MEETING AND THE PANE'S FORM SHARE. Each is the bare control: the label and
 * layout around it are the caller's, because a dialog and a 22rem pane lay them out differently.
 */

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

/**
 * The MEETING's zone, not the reader's: "09:00 Toronto time" is what was agreed. The list names
 * each zone by its abbreviation now; the meeting itself says the one it wears at its own instant.
 */
export function ZonePicker({ value, onPick }: { value: string; onPick: (zone: string) => void }) {
  const now = useNow()
  return (
    <PickOne
      label="Time zone"
      value={value}
      choices={ZONES.map((z) => ({ value: z, label: zoneLabel(z, now) }))}
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
  /**
   * The value is a saved meeting's, which may be a rule the menu does not offer: it stays a
   * choice while it is the value, or the control would show a placeholder for it.
   */
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

/** Who is in it, picked from everyone in People. */
export function AttendeesPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
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
