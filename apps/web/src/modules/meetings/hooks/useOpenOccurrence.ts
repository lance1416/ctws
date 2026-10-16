import { idFrom, meetingId, type MeetingId, type MeetingOccurrence } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { occurrenceQuery, seriesQuery } from '../api'
import { MEETINGS_ID } from '../logic/id'

/** An occurrence by its two ids: a series has many, so its id alone does not name one. */
type Occurrence = { meetingId: MeetingId; recurrenceId: string }

/** The series the address names, and which of its occurrences; null `at` is the next one. */
export type Named = { meetingId: MeetingId; at: string | null }

/**
 * The open occurrence is in the address: on the Meetings page as `/meetings/<id>?at=<occurrence>`,
 * over any other page as `?meeting=<id>&at=<occurrence>`, which keeps that page's own parameters.
 */
function useOccurrenceAddress(where: 'page' | 'over') {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const raw = where === 'page' ? id : params.get('meeting')
  const named: Named | null =
    raw === undefined || raw === null
      ? null
      : { meetingId: idFrom(meetingId, raw), at: params.get('at') }
  const show = (next: Occurrence | null, { replace = false }: { replace?: boolean } = {}) => {
    if (where === 'page') {
      navigate(
        next
          ? `/${MEETINGS_ID}/${next.meetingId}?${new URLSearchParams({ at: next.recurrenceId })}`
          : `/${MEETINGS_ID}`,
        { replace },
      )
      return
    }
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev)
        out.delete('meeting')
        out.delete('at')
        if (next) {
          out.set('meeting', next.meetingId)
          out.set('at', next.recurrenceId)
        }
        return out
      },
      { replace },
    )
  }
  return { named, show }
}

/**
 * The one way a meeting's pane opens: the address names the occurrence, a list on screen is looked
 * in first (so the pane follows the list's refetches), and only what it does not hold is read on
 * its own, once the list is in. A series named without an occurrence opens its next one.
 */
export function useOpenOccurrence({
  where,
  listed,
  ready,
  today,
}: {
  where: 'page' | 'over'
  /** The named occurrence among those on screen, if it is there. */
  listed: (named: Named) => MeetingOccurrence | undefined
  /** Whether what is on screen has loaded, so a miss there means asking for it. */
  ready: boolean
  today: string
}) {
  const { named, show } = useOccurrenceAddress(where)
  const onScreen = named ? listed(named) : undefined
  const missing = named !== null && ready && !onScreen
  const one = useQuery({
    ...occurrenceQuery(named?.meetingId ?? null, named?.at ?? ''),
    enabled: missing && named.at !== null,
  })
  const next = useQuery({
    ...seriesQuery(named?.meetingId ?? null, today),
    enabled: missing && named.at === null,
  })
  const fetched = named?.at === null ? next : one
  const found = onScreen ?? fetched.data ?? null
  return {
    named,
    found,
    /** Named, looked for, and not there: cancelled, or never was. */
    gone: named !== null && !found && fetched.isSuccess,
    show,
  }
}

export type OpenOccurrence = ReturnType<typeof useOpenOccurrence>
