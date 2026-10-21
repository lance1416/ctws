import type { BirthdayResponse, PersonResponse } from '@ctws/contracts'
import { ExpandIcon } from '../../../platform/ui/icons'
import { useState, type ReactNode } from 'react'
import { countdownPhrase, shortDay, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Field } from '../../../platform/ui/Field'
import { useTimeZone } from '../../../shell/auth'
import { LEAD_LABELS } from '../logic/labels'
import { givenDate } from './text'

/**
 * A person's birthday field; the lunar date, zodiac, sign, hour and next one open across the row
 * below it. Read only: a birthday is edited with the rest of the person.
 */
export function BirthdayField({ person }: { person: PersonResponse }) {
  const [open, setOpen] = useState(false)
  const b = person.birthday

  return (
    <>
      <Field label="Birthday">
        <button
          type="button"
          aria-expanded={open}
          aria-label={b ? `Birthday, ${givenDate(b)}` : 'Birthday, not set'}
          disabled={!b}
          onClick={() => setOpen(!open)}
          className={`-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-control px-1.5 py-0.5 text-left text-ui ${
            b ? 'text-ink hover:bg-hover' : 'text-subtle'
          }`}
        >
          <span className="truncate">{b ? givenDate(b) : 'Not set'}</span>
          {b && <ExpandIcon size={16} className="h-3 w-3 shrink-0 text-subtle" />}
        </button>
      </Field>

      {open && b && (
        <div
          data-birthday-more
          className="col-span-full rounded-control border border-line-strong p-3"
        >
          <BirthdayRead birthday={b} />
        </div>
      )}
    </>
  )
}

function BirthdayRead({ birthday: b }: { birthday: BirthdayResponse }) {
  const today = ymd(useNow(), useTimeZone())
  return (
    <div data-birthday className="flex flex-col gap-2">
      <p className="text-ui text-muted tabular-nums">
        Next <span className="font-medium text-ink">{shortDay(b.next.day, today)}</span>
        <span className="text-subtle"> · </span>
        {countdownPhrase(b.next.inDays)}
        {b.next.turns !== null && (
          <>
            <span className="text-subtle"> · </span>turns {b.next.turns}
          </>
        )}
      </p>

      {/* A lunar birthday's lunar date is its given date, said above. */}
      {((b.calendar === 'solar' && b.bornLunar) || b.zodiac || b.sign || b.hour) && (
        <div className="flex flex-wrap gap-1.5">
          {b.calendar === 'solar' && b.bornLunar && <Chip>{b.bornLunar}</Chip>}
          {b.zodiac && <Chip>{b.zodiac}</Chip>}
          {b.sign && <Chip>{b.sign}</Chip>}
          {b.hour && <Chip>{b.hour}</Chip>}
        </div>
      )}

      {b.next.keptNote && <p className="text-meta text-go-t">{b.next.keptNote}</p>}

      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-line pt-2">
        <span className="text-meta text-muted">Tell me</span>
        <span className="text-ui text-ink">{LEAD_LABELS[b.remindLead]}</span>
      </div>
    </div>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      data-birthday-chip
      className="inline-flex h-[22px] items-center rounded-control border border-line px-2 text-meta text-muted"
    >
      {children}
    </span>
  )
}
