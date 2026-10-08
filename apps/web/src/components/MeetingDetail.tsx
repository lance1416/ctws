import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { listContacts } from '../api/contacts'
import { cancelMeeting, patchMeeting, repeatChoices, repeatLabel } from '../api/meetings'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { ZONES, zoneLabel } from '../timeZones'
import { DeleteConfirm } from './DeleteConfirm'
import { DetailHead, DetailPane } from './DetailPane'
import { boxed } from './formStyles'
import { InlineText, PickMany, PickOne } from './inline'
import { ScopeAsk } from './ScopeAsk'

/**
 * ONE MEETING, in the shell's detail pane -- the same pane a task and a person open in.
 *
 * What is open is an OCCURRENCE, not a series: 「这周二那个会」. Changing it therefore has to ask
 * which one you mean, and only for the things that can differ between two occurrences. Everything
 * else is the series', and changes all of them.
 *
 * The two fields that are real fields here are the clock and the zone. A time is composed, so
 * `datetime-local` is the control every browser already has for composing one; it still writes on
 * leaving, like everything else in this pane. There is no 保存.
 */
export function MeetingDetail({
  meeting,
  accountZone,
  onClose,
}: {
  meeting: MeetingOccurrence
  /** The account's own zone: what the clock beside the meeting's own is in. */
  accountZone: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const rail = useProjectRail()
  const [cancelling, setCancelling] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** A change waiting on 「只改这次 / 以后都改」. Null when nothing is being asked. */
  const [asking, setAsking] = useState<{ what: string; patch: UpdateMeetingInput } | null>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const contacts = useQuery({ queryKey: ['contacts', null, false], queryFn: () => listContacts() })

  const repeats = meeting.rrule !== null
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['meetings'] })
    await qc.invalidateQueries({ queryKey: ['meeting-calendar'] })
  }

  const save = useMutation({
    mutationFn: (patch: UpdateMeetingInput) => patchMeeting(meeting.meetingId, patch),
    onSuccess: () => setFailed(null),
    onError: (e) => setFailed(e instanceof Error ? e.message : '没能保存'),
    onSettled: refresh,
  })
  const drop = useMutation({
    mutationFn: (scope: EditScope) =>
      cancelMeeting(meeting.meetingId, { scope, recurrenceId: meeting.recurrenceId }),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })

  /** A change to the SERIES: title, place, people, project, the rule itself. Never asks. */
  const series = (patch: UpdateMeetingInput) => save.mutate({ ...patch, scope: 'all' })

  /**
   * A change to WHEN or HOW LONG. On a repeating meeting this is the one that has to ask; on a
   * one-off there is nothing to ask about.
   */
  const timing = (patch: UpdateMeetingInput, what: string) => {
    if (!repeats) return save.mutate({ ...patch, scope: 'all' })
    setAsking({ what, patch })
  }

  const chip = (id: string) => (
    <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />
  )
  const choices = repeatChoices(meeting.startsLocal)
  const elsewhere = meeting.timeZone !== accountZone

  return (
    <DetailPane label="会议" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <DetailHead
            kind={
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
                会议
                {meeting.overridden && <span className="text-xs text-fg-subtle">这次改过</span>}
              </span>
            }
            onClose={onClose}
          />
          <InlineText
            label="标题"
            value={meeting.title}
            placeholder="这个会叫什么"
            onSave={(title) => title && series({ title })}
            className="mt-0.5 block text-lg font-semibold text-fg"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Field label="开始">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <input
                type="datetime-local"
                aria-label="开始"
                key={meeting.startsLocal}
                defaultValue={meeting.startsLocal}
                onBlur={(e) => {
                  const next = e.target.value
                  // An emptied field is not a request to cancel the meeting, so it is put back.
                  if (!next) {
                    e.target.value = meeting.startsLocal
                    return
                  }
                  if (next !== meeting.startsLocal) {
                    timing(
                      { startsLocal: next },
                      `这是重复的会议，要把它移到 ${next.replace('T', ' ')} 吗？`,
                    )
                  }
                }}
                className={`${boxed} h-8 py-0 text-sm tabular-nums`}
              />
              {/* The zone is the MEETING's: 「多伦多时间 09:00」 is what was agreed, whatever the
                  clock says here. */}
              <PickOne
                label="时区"
                value={meeting.timeZone}
                choices={ZONES.map((z) => ({ value: z, label: zoneLabel(z) }))}
                onPick={(timeZone) => series({ timeZone })}
              />
            </div>
          </Field>
          {elsewhere && (
            <Field label="你这儿">
              {/* The same meeting on the account's own clock -- 「我几点要到场」. Read-only: the
                  time was agreed in the other zone, and editing it here would be editing a
                  conversion. */}
              <span data-local-clock className="text-sm tabular-nums text-fg-muted">
                {new Intl.DateTimeFormat('zh-CN', {
                  timeZone: accountZone,
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(meeting.startsAt))}
              </span>
            </Field>
          )}
          <Field label="多久">
            <PickOne
              label="多久"
              value={String(meeting.durationMinutes)}
              choices={[15, 30, 45, 60, 90, 120].map((m) => ({
                value: String(m),
                label: m >= 60 ? `${m / 60} 小时` : `${m} 分钟`,
              }))}
              onPick={(m) =>
                timing({ durationMinutes: Number(m) }, '这是重复的会议，要改哪些场次的时长？')
              }
            />
          </Field>
          <Field label="重复">
            <PickOne
              label="重复"
              value={meeting.rrule ?? '__none'}
              /* A rule the menu does not offer is still one of its options while it is the
                 current value, or the control would show a placeholder for a value it has. */
              choices={[
                ...choices.map((c) => ({ value: c.value ?? '__none', label: c.label })),
                ...(meeting.rrule && !choices.some((c) => c.value === meeting.rrule)
                  ? [
                      {
                        value: meeting.rrule,
                        label: repeatLabel(meeting.rrule, meeting.startsLocal),
                      },
                    ]
                  : []),
              ]}
              onPick={(v) => series({ rrule: v === '__none' ? null : v })}
            />
          </Field>
        </div>

        {asking && (
          <ScopeAsk
            what={asking.what}
            onPick={(scope) => {
              save.mutate({ ...asking.patch, scope, recurrenceId: meeting.recurrenceId })
              setAsking(null)
            }}
            onCancel={() => setAsking(null)}
          />
        )}
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {failed}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Field label="地点">
            <InlineText
              label="地点"
              value={meeting.location ?? ''}
              placeholder="没有填"
              onSave={(location) => series({ location: location || null })}
              className="text-sm"
            />
          </Field>
          <Field label="项目" top>
            <PickOne
              label="项目"
              value={meeting.projectId}
              choices={(projects.data ?? [])
                .filter((p) => !p.archivedAt)
                .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) }))}
              onPick={(projectId) => series({ projectId })}
              placeholder="不属于任何项目"
            />
          </Field>
        </div>

        <div>
          <span className="block text-xs text-fg-muted">参与人</span>
          <div className="mt-1" data-attendees>
            <PickMany
              label="参与人"
              chosen={meeting.attendees.map((p) => ({ value: p.id, label: p.name }))}
              choices={(contacts.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              onChange={(attendeeIds) => series({ attendeeIds })}
              empty="还没有人"
            />
          </div>
        </div>

        <div>
          <span className="block text-xs text-fg-muted">备注</span>
          <InlineText
            label="备注"
            value={meeting.note ?? ''}
            placeholder="还没有备注"
            multiline
            onSave={(note) => series({ note: note || null })}
            className="mt-1 block max-w-[68ch] text-sm whitespace-pre-wrap text-fg"
          />
        </div>

        <div className="pt-1">
          {cancelling ? (
            repeats ? (
              <ScopeAsk
                what={`取消「${meeting.title}」的哪些场次？`}
                onPick={(scope) => drop.mutate(scope)}
                onCancel={() => setCancelling(false)}
              />
            ) : (
              <DeleteConfirm
                label="确认取消会议"
                message={`取消「${meeting.title}」？`}
                busy={drop.isPending}
                onConfirm={() => drop.mutate('all')}
                onCancel={() => setCancelling(false)}
              />
            )
          ) : (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="h-9 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
            >
              取消会议
            </button>
          )}
        </div>
      </div>
    </DetailPane>
  )
}

function Field({
  label,
  top = false,
  children,
}: {
  label: string
  top?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex gap-2 ${top ? 'items-start' : 'items-center'}`}>
      <span className={`w-10 shrink-0 text-xs text-fg-muted ${top ? 'pt-2' : ''}`}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
