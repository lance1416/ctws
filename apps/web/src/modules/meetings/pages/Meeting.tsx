import { idFrom, meetingId, type MeetingOccurrence, type UpdateSeriesBody } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DangerZone } from '../../../platform/ui/DangerZone'
import { useAccountToday } from '../../../shell/auth'
import { DeletedNotice } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import {
  type EditScope,
  meetingKeys,
  occurrenceQuery,
  restoreOccurrence,
  seriesQuery,
} from '../api'
import { CancelMeeting } from '../components/CancelMeeting'
import { occurrenceTo } from '../components/EarlierInSeries'
import { MeetingForm } from '../components/MeetingForm'
import { useScopedEdit } from '../components/useScopedEdit'
import { MEETINGS_ID } from '../logic/id'
import { MeetingPage } from './MeetingPage'

/**
 * The occurrence the address names (`/meetings/<id>?at=<occurrence>`), or the series' next when it
 * names none; and whether it is gone.
 */
function useAddressed() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const today = useAccountToday()
  const series = idFrom(meetingId, id)
  const at = params.get('at')
  const one = useQuery({ ...occurrenceQuery(series, at ?? ''), enabled: at !== null })
  const next = useQuery({ ...seriesQuery(series, today), enabled: at === null })
  const read = at === null ? next : one
  return {
    id,
    at,
    meeting: read.data ?? null,
    gone: read.isSuccess && !read.data,
    params,
  }
}

/** `/meetings/:id`: one occurrence's page (FR-067), or what happened to it. */
export function Meeting() {
  const { id, at, meeting: m, gone, params } = useAddressed()
  useForgetWhenGone('meeting', id, gone && at === null)
  useSubjectOf(m ? { type: 'meeting', id: m.meetingId, title: m.title } : null)
  useRecordRecent(
    m
      ? {
          type: 'meeting',
          id: m.meetingId,
          title: m.title,
          to: `/${MEETINGS_ID}/${m.meetingId}`,
          kind: 'Meeting',
        }
      : null,
  )
  // Cancelled from its More menu, it can be taken back from here (FR-068).
  if (gone && at && params.get('cancelled') === '1') return <Cancelled id={id} at={at} />
  if (gone) return <DeletedNotice type="meeting" id={id} />
  if (!m) return null
  return (
    <MeetingPage
      key={`${m.meetingId}@${m.recurrenceId}`}
      meeting={m}
      writing={params.get('write') === '1'}
    />
  )
}

/** One occurrence just cancelled: said so, with the way to take it back. */
function Cancelled({ id, at }: { id: string; at: string }) {
  const navigate = useNavigate()
  const restore = useMutation({
    mutationFn: () => restoreOccurrence(idFrom(meetingId, id), at),
    meta: { changes: ['meeting'], awaits: [meetingKeys.all], ownsError: true },
    onSuccess: (back: MeetingOccurrence) => navigate(occurrenceTo(back), { replace: true }),
  })
  return (
    <div role="status" className="flex flex-col items-start gap-3 py-6">
      <h1 className="text-subject text-ink">This one is cancelled</h1>
      <p className="text-ui text-muted">The rest of the series is as it was.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
          className={BUTTON.primary}
        >
          Take it back
        </button>
        <button
          type="button"
          onClick={() => navigate(`/${MEETINGS_ID}/${id}`)}
          className={BUTTON.secondary}
        >
          See the next one
        </button>
      </div>
      {restore.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(restore.error)}
        </p>
      )}
    </div>
  )
}

const SCOPES: readonly EditScope[] = ['one', 'following', 'all']

/**
 * `/meetings/:id/edit`: the form, reaching as far as was chosen when Edit was pressed (FR-068);
 * deleting the whole series at its foot (FR-035).
 */
export function MeetingEdit() {
  const { id, meeting: m, gone, params } = useAddressed()
  const navigate = useNavigate()
  const asked = params.get('scope') as EditScope | null
  const scope: EditScope = m?.rrule && asked && SCOPES.includes(asked) ? asked : 'all'
  if (gone) return <DeletedNotice type="meeting" id={id} />
  if (!m) return null
  return <EditForm key={m.recurrenceId} meeting={m} scope={scope} navigate={navigate} />
}

const REACH: Record<EditScope, string> = {
  one: 'Only this one',
  following: 'This one and every one after',
  all: 'The whole series',
}

function EditForm({
  meeting: m,
  scope,
  navigate,
}: {
  meeting: MeetingOccurrence
  scope: EditScope
  navigate: ReturnType<typeof useNavigate>
}) {
  const back = () => navigate(occurrenceTo(m))
  const edit = useScopedEdit(m, {
    moved: (to) => navigate(occurrenceTo(to), { replace: true }),
    saved: back,
  })
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 tabIndex={-1} className="text-title tracking-[-0.02em] focus:outline-none">
          Edit {m.title}
        </h1>
        {m.rrule && <p className="text-ui text-muted">Changing: {REACH[scope]}</p>}
      </div>
      {edit.failed && (
        <p role="alert" className="text-ui text-stop-t">
          {edit.failed}
        </p>
      )}
      <div className="rounded-block border border-line bg-panel p-4">
        <MeetingForm
          meeting={m}
          busy={edit.busy}
          onCancel={back}
          onSave={(patch: UpdateSeriesBody) => edit.submitAs(patch, scope)}
        />
      </div>
      <DangerZone>
        <CancelMeeting meeting={m} whole onCancelled={() => navigate(`/${MEETINGS_ID}`)} />
      </DangerZone>
    </div>
  )
}
