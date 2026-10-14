import { HANG_WIDTH } from '../../platform/ui/hang'
import type { Lead, LeadTone } from './leads'

/**
 * A row's first column, saying when in one short word (`leadFor`). Right-aligned and tabular, so
 * a list's dates end at one x; on the title's own line, so word and title read as one.
 */

const TONE: Record<LeadTone, string> = {
  missed: 'text-missed',
  deadline: 'text-deadline',
  plan: 'text-plan',
  time: 'text-ink-muted',
  quiet: 'text-ink-subtle',
}

/**
 * What kind of date it is, for a screen reader: the colour and the flag say it to the eye, and
 * neither reaches a reader who cannot see them (WCAG 1.4.1).
 */
const SAID: Record<LeadTone, string> = {
  missed: 'Overdue, due ',
  deadline: 'Due ',
  plan: 'Planned ',
  time: '',
  quiet: '',
}

export function RowLead({
  lead,
  dateTime,
}: {
  lead: Lead | null
  /** The instant the word names, when it names one: the word is then a `<time>`. */
  dateTime?: string | undefined
}) {
  const Word = dateTime ? 'time' : 'span'
  return (
    <span
      data-row-lead={lead?.tone}
      title={lead?.exact}
      className={`flex shrink-0 items-start justify-end gap-1 pt-2.5 pr-2 text-sm leading-6 whitespace-nowrap tabular-nums sm:pr-3.5 ${HANG_WIDTH} ${
        lead ? TONE[lead.tone] : ''
      }`}
    >
      {lead && (
        <>
          {lead.flag && <FlagMark filled={lead.tone === 'missed'} />}
          <span className="sr-only">{SAID[lead.tone]}</span>
          <Word data-row-lead-text dateTime={dateTime}>
            {lead.text}
          </Word>
        </>
      )}
    </span>
  )
}

/**
 * A deadline's flag, upright beside its word. Filled once the line has been crossed. It is the
 * margin's one shape: a plan has none, so a deadline and a plan differ by silhouette as well as by
 * colour family.
 */
function FlagMark({ filled }: { filled: boolean }) {
  return (
    <svg
      data-flag
      aria-hidden="true"
      viewBox="0 0 10 12"
      width="10"
      height="12"
      className="mt-1.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 11V1.2" />
      <path d="M1.5 1.6h6.6l-1.6 2.6 1.6 2.6H1.5" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}
