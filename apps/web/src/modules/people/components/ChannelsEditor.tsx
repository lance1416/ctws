import { channelProblem, type ChannelKind, type PersonChannel } from '@ctws/contracts'
import { useState } from 'react'
import { boxed } from '../../../platform/ui/formStyles'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CloseIcon, NewIcon, REACH_ICON } from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { byKind, channelPlaceholder, KIND_CHOICES, KIND_LABEL } from '../logic/channels'
import { usePhone } from '../hooks/usePhone'

/**
 * One way to reach someone, as a form holds it. `touched`: left at least once, so a row still
 * being typed is not scolded. `seed`: the country code the form put there itself; a row holding
 * only that is still empty. `saved`: as stored, untouched this time. `raw`: not yet seen by the
 * phone module, which loads late.
 */
type ChannelRow = PersonChannel & { touched?: boolean; seed?: string; saved?: boolean; raw?: true }

/** A row holding only the seeded country code is not written on. */
const written = (c: ChannelRow) => c.value.trim() !== '' && c.value !== c.seed

/**
 * A form's channel rows: phones grouped as typed and saved as E.164, an empty phone row seeded with
 * the local code, and each row judged only once it has been left.
 */
export function useChannelRows(initial: () => ChannelRow[]) {
  const [opened] = useState(initial)
  const [held, setRows] = useState<ChannelRow[]>(() => opened.map((row) => ({ ...row, raw: true })))
  const phone = usePhone()
  const region = phone?.currentRegion()
  const save = (list: ChannelRow[]): PersonChannel[] =>
    byKind(list)
      .filter(written)
      .map((c) => ({
        kind: c.kind,
        value: c.kind === 'phone' && phone ? phone.toE164(c.value, region) : c.value.trim(),
        label: c.label?.trim() || null,
      }))
  // Once the phone module is here, a row it has not seen is shown settled: a stored number
  // normalised (an old `(730) 197-4443` would otherwise fail the check and block Save), an empty
  // phone row given the local code. An edit keeps the settled row.
  const settled = (row: ChannelRow): ChannelRow => {
    if (!phone || !row.raw) return row
    const { raw: _, ...seen } = row
    if (row.kind !== 'phone') return seen
    if (row.value.trim() === '') {
      const code = phone.callingCodeFor(region) ?? ''
      return { ...seen, value: code, seed: code }
    }
    return row.saved
      ? { ...seen, value: phone.formatPhone(phone.toE164(row.value, region), region) }
      : seen
  }
  const rows = held.map(settled)

  const seed = phone?.callingCodeFor(region) ?? ''
  const typed = (kind: ChannelKind, was: string, now: string) =>
    kind === 'phone' && phone ? phone.retype(was, now, region) : now
  const edit = (at: number, change: (row: ChannelRow) => ChannelRow) =>
    setRows((all) => all.map((row, i) => (i === at ? change(settled(row)) : row)))
  // The seeded code goes with the kind: it is not something a person wrote.
  const switched = (row: ChannelRow, kind: ChannelKind): ChannelRow => {
    const value = row.value === row.seed ? '' : row.value
    if (kind !== 'phone') return { kind, label: row.label, value }
    // Before the phone module is here there is no code to seed: the row waits for it, unseen.
    if (value.trim() === '') {
      return phone
        ? { kind, label: row.label, value: seed, seed }
        : { kind, label: row.label, value, raw: true }
    }
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
    /** "Personal", "WeChat": said beside the value on their page (FR-062). */
    setLabel: (at: number, label: string) => edit(at, (row) => ({ ...row, label })),
    add: () => setRows((all) => [...all, { kind: 'email', value: '', label: null }]),
    remove: (at: number) => setRows((all) => all.filter((_, i) => i !== at)),
    /** The rows worth saving, in kind order, phones as E.164. */
    toSave: () => save(rows),
    /**
     * Whether saving would write something other than what the form opened on. Both sides are read
     * the same way now, so a stored number in an older spelling is not a change once the phone
     * module has normalised it.
     */
    changed: () => JSON.stringify(save(rows)) !== JSON.stringify(save(opened)),
  }
}

/**
 * The ways to reach someone, as artboard 11 has them (N-02): each row its kind's icon, which picks
 * another kind, the value, and a label of its own; "Another way" adds a row, as Another name and
 * Another role do.
 */
export function ChannelsEditor({ channels }: { channels: ReturnType<typeof useChannelRows> }) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {channels.rows.map((c, i) => (
          <li
            key={i}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_8rem_auto] items-center gap-1.5"
          >
            <KindButton
              label={`Type of item ${i + 1}`}
              kind={c.kind}
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
              className={`${boxed} min-w-0 text-ui ${c.kind === 'phone' ? 'tabular-nums' : ''}`}
            />
            <input
              aria-label={`Label for way ${i + 1}`}
              value={c.label ?? ''}
              placeholder="Label"
              onChange={(e) => channels.setLabel(i, e.target.value)}
              className={`${boxed} min-w-0 text-ui`}
            />
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              onClick={() => channels.remove(i)}
              className="inline-grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink"
            >
              <CloseIcon size={14} aria-hidden="true" />
            </button>
            {channels.shown[i] !== undefined && (
              <p className="col-span-4 text-meta text-stop-t">{channels.shown[i]}</p>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={channels.add}
        className="inline-flex items-center gap-1.5 self-start rounded-control px-1 py-0.5 text-ui text-muted hover:text-ink"
      >
        <NewIcon size={14} aria-hidden="true" />
        Another way
      </button>
    </>
  )
}

/** The row's kind as its icon; pressed, the kinds to change it to. */
function KindButton({
  label,
  kind,
  onPick,
}: {
  label: string
  kind: ChannelKind
  onPick: (kind: ChannelKind) => void
}) {
  const Icon = REACH_ICON[kind]
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`${label}: ${KIND_LABEL[kind]}`}
        title={KIND_LABEL[kind]}
        className={`${boxed} inline-grid w-9 place-items-center px-0 text-muted hover:text-ink`}
      >
        <Icon size={14} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
          {KIND_CHOICES.map((choice) => {
            const ChoiceIcon = REACH_ICON[choice.value]
            return (
              <DropdownMenu.Item
                key={choice.value}
                onSelect={() => {
                  if (choice.value !== kind) onPick(choice.value)
                }}
                className={MENU_ITEM}
              >
                <ChoiceIcon size={14} aria-hidden="true" className="text-muted" />
                <span>{choice.label}</span>
                {choice.value === kind && (
                  <span className="ml-auto text-meta text-subtle">Current</span>
                )}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
