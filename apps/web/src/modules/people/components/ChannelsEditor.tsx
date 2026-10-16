import { channelProblem, type ChannelKind, type PersonChannel } from '@ctws/contracts'
import { useEffect, useState } from 'react'
import { boxed } from '../../../platform/ui/formStyles'
import { CloseIcon, PlusIcon } from '../../../platform/ui/icons'
import { PickOne } from '../../../platform/ui/inline'
import { byKind, channelPlaceholder, KIND_CHOICES } from '../logic/channels'
import { usePhone } from '../hooks/usePhone'

/**
 * One way to reach someone, as a form holds it. `touched`: left at least once, so a row still
 * being typed is not scolded. `seed`: the country code the form put there itself; a row holding
 * only that is still empty. `saved`: as stored, untouched this time.
 */
type ChannelRow = PersonChannel & { touched?: boolean; seed?: string; saved?: boolean }

/** A row holding only the seeded country code is not written on. */
const written = (c: ChannelRow) => c.value.trim() !== '' && c.value !== c.seed

/**
 * A form's channel rows: phones grouped as typed and saved as E.164, an empty phone row seeded with
 * the local code, and each row judged only once it has been left.
 */
export function useChannelRows(initial: () => ChannelRow[]) {
  const [rows, setRows] = useState<ChannelRow[]>(initial)
  const phone = usePhone()
  const region = phone?.currentRegion()
  // Once the phone module arrives, stored numbers are normalised (an old `(730) 197-4443` would
  // otherwise fail the check and block Save) and empty phone rows get the local code.
  useEffect(() => {
    if (!phone) return
    const code = phone.callingCodeFor(region) ?? ''
    setRows((all) =>
      all.map((row) =>
        row.kind !== 'phone'
          ? row
          : row.value.trim() === ''
            ? { ...row, value: code, seed: code }
            : row.saved
              ? { ...row, value: phone.formatPhone(phone.toE164(row.value, region), region) }
              : row,
      ),
    )
  }, [phone, region])

  const seed = phone?.callingCodeFor(region) ?? ''
  const typed = (kind: ChannelKind, was: string, now: string) =>
    kind === 'phone' && phone ? phone.retype(was, now, region) : now
  const edit = (at: number, change: (row: ChannelRow) => ChannelRow) =>
    setRows((all) => all.map((row, i) => (i === at ? change(row) : row)))
  // The seeded code goes with the kind: it is not something a person wrote.
  const switched = (row: ChannelRow, kind: ChannelKind): ChannelRow => {
    const value = row.value === row.seed ? '' : row.value
    if (kind !== 'phone') return { kind, label: row.label, value }
    if (value.trim() === '') return { kind, label: row.label, value: seed, seed }
    return { kind, label: row.label, value: typed(kind, value, value) }
  }

  // An empty row is not a problem: adding one and changing your mind must not block Save.
  const problems = rows.map((c) =>
    !written(c)
      ? undefined
      : (channelProblem(c.kind, c.value) ??
        (c.kind === 'phone' ? (phone?.phoneProblem(c.value) ?? undefined) : undefined)),
  )

  return {
    rows,
    /** Any row that cannot be saved; Save waits on all of them. */
    bad: problems.some((p) => p !== undefined),
    /** What each row says, once it has been left. */
    shown: problems.map((p, i) => (rows[i]?.touched ? p : undefined)),
    setKind: (at: number, kind: ChannelKind) => edit(at, (row) => switched(row, kind)),
    // Typing again takes the warning away: a fix should show at once.
    type: (at: number, now: string) =>
      edit(at, (row) => ({
        ...row,
        value: typed(row.kind, row.value, now),
        touched: false,
        saved: false,
      })),
    leave: (at: number) => edit(at, (row) => ({ ...row, touched: true })),
    add: () => setRows((all) => [...all, { kind: 'email', value: '', label: null }]),
    remove: (at: number) => setRows((all) => all.filter((_, i) => i !== at)),
    /** The rows worth saving, in kind order, phones as E.164. */
    toSave: (): PersonChannel[] =>
      byKind(rows)
        .filter(written)
        .map((c) => ({
          kind: c.kind,
          value: c.kind === 'phone' && phone ? phone.toE164(c.value, region) : c.value.trim(),
          label: c.label?.trim() || null,
        })),
  }
}

export function ChannelsEditor({ channels }: { channels: ReturnType<typeof useChannelRows> }) {
  return (
    <>
      <ul className="mt-1.5 flex flex-col gap-2">
        {channels.rows.map((c, i) => (
          <li key={i} className="flex min-w-0 flex-wrap items-center gap-1.5">
            <PickOne
              label={`Type of item ${i + 1}`}
              value={c.kind}
              choices={KIND_CHOICES}
              onPick={(kind) => channels.setKind(i, kind)}
            />
            <input
              aria-label={`Item ${i + 1}`}
              value={c.value}
              placeholder={channelPlaceholder(c.kind)}
              type={c.kind === 'phone' ? 'tel' : 'text'}
              inputMode={c.kind === 'phone' ? 'tel' : 'text'}
              aria-invalid={channels.shown[i] !== undefined}
              onChange={(e) => channels.type(i, e.target.value)}
              // Judged on leaving: `+44` is not yet a number, and unfinished is not wrong.
              onBlur={() => channels.leave(i)}
              className={`${boxed} min-w-0 flex-1 text-sm ${c.kind === 'phone' ? 'tabular-nums' : ''}`}
            />
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => channels.remove(i)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink"
            >
              <CloseIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            {channels.shown[i] !== undefined && (
              <p className="w-full text-xs text-danger">{channels.shown[i]}</p>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={channels.add}
        className="mt-1.5 flex h-8 items-center gap-1.5 rounded-md border border-dashed border-rule-strong px-2.5 text-sm text-ink-muted hover:bg-hover hover:text-ink"
      >
        <PlusIcon className="h-3 w-3" strokeWidth={1.8} />
        Add one
      </button>
    </>
  )
}
