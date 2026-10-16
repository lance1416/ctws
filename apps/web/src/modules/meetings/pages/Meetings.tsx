import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useForgetWhenGone } from '../../../shell/search'
import { GoneNotice } from '../../../shell/detail'
import { meetingsQuery } from '../api'
import { MeetingDays } from '../components/MeetingDays'
import { nextOfEach } from '../logic/nextOfEach'
import { EmptyState } from '../../../platform/ui/EmptyState'
import { OccurrencePane } from '../components/OccurrencePane'
import { useOpenOccurrence } from '../hooks/useOpenOccurrence'
import { NewMeetingDialog } from '../components/NewMeetingDialog'
import { LIST_MEASURE } from '../../../shell/rows'
import { PanelEmpty } from '../../../platform/ui/Panel'
import { addDays } from '@ctws/core/day'
import { ymd } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth'
import { useNow } from '../../../platform/time/useNow'
import { Button } from '../../../platform/ui/Button'
import { QueryStatus } from '../../../platform/ui/QueryStatus'
import { PageHead } from '../../../platform/ui/PageHead'
import { HANG } from '../../../platform/ui/hang'

/** How far either way the two sections reach. */
const WINDOW_DAYS = 31

/** One row per series, showing its next occurrence; coming up first, the past behind a toggle. */
export function Meetings() {
  const accountZone = useTimeZone()
  const now = useNow()
  const today = ymd(now, accountZone)
  const [making, setMaking] = useState(false)
  const [showPast, setShowPast] = useState(false)

  const ahead = useQuery(meetingsQuery({ from: today, to: addDays(today, WINDOW_DAYS) }))
  const behind = useQuery({
    ...meetingsQuery({ from: addDays(today, -WINDOW_DAYS), to: addDays(today, -1) }),
    enabled: showPast,
  })

  const coming = nextOfEach(ahead.data ?? [], now)
  // Reversed, so the most recent of each series is the one shown.
  const past = nextOfEach([...(behind.data ?? [])].reverse(), now)
  // A named occurrence is any of the listed ones, not only the row's: today's stays open after it
  // ends and the row moves on to tomorrow's. Without `at` the link names only the series.
  const open = useOpenOccurrence({
    where: 'page',
    listed: ({ meetingId, at }) =>
      at === null
        ? [...coming, ...past].find((m) => m.meetingId === meetingId)
        : [...(ahead.data ?? []), ...(behind.data ?? [])].find(
            (m) => m.meetingId === meetingId && m.recurrenceId === at,
          ),
    ready: ahead.isSuccess,
    today,
  })
  // One occurrence gone is not the series gone, so only a series is forgotten.
  useForgetWhenGone('meeting', open.named?.meetingId ?? null, open.gone && open.named?.at === null)

  return (
    <>
      <div className={`${HANG} flex flex-wrap items-center justify-between gap-3`}>
        <PageHead>Meetings</PageHead>
        <Button look="secondary" onClick={() => setMaking(true)} className="whitespace-nowrap">
          New meeting
        </Button>
      </div>

      <QueryStatus query={ahead} />
      {ahead.isSuccess && coming.length === 0 && (
        <EmptyState hang title="Nothing in the next month" />
      )}

      <div className={`mt-6 ${LIST_MEASURE}`}>
        {coming.length > 0 && (
          <MeetingDays label="Coming up" rows={coming} today={today} now={now} onOpen={open.show} />
        )}

        <div className="mt-8">
          {/* Less the button's own `px-2`, so its word starts on the hang. */}
          <Button
            look="inline"
            onClick={() => setShowPast((v) => !v)}
            className="ml-[calc(var(--hang)-var(--spacing)*2)]"
          >
            {showPast ? 'Hide earlier' : 'Earlier'}
          </Button>
          {showPast &&
            (past.length === 0 ? (
              <PanelEmpty hang>Nothing in the past month</PanelEmpty>
            ) : (
              <div className="mt-4">
                <MeetingDays
                  label="Earlier"
                  rows={past}
                  today={today}
                  now={now}
                  onOpen={open.show}
                />
              </div>
            ))}
        </div>
      </div>

      {making && (
        <NewMeetingDialog
          onClose={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false)
            // Straight into the pane, where what the form cannot hold (a note, a place) is edited.
            open.show(made)
          }}
        />
      )}
      <OccurrencePane open={open} />
      {/* Gone, or cancelled. */}
      {open.gone && <GoneNotice kind="meeting" />}
    </>
  )
}
