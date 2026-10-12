import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { listPeople } from '../api/people'
import {
  cancelMeeting,
  patchMeeting,
  repeatChoices,
  repeatLabel,
  untilOf,
  withUntil,
} from '../api/meetings'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { ZONES, zoneLabel } from '../timeZones'
import { shortDay, todayIn } from '../dueAt'
import { DangerAction, DangerZone } from './DangerZone'
import { meetingLink } from '../meetingPlace'
import { Field } from './Field'
import { Link } from 'react-router-dom'
import { DetailHead, DetailPane } from './DetailPane'
import { LinkedSection } from './Links'
import { useComposing } from '../composition'
import { boxed, CHIP, field, label } from './formStyles'
import { PickMany, PickOne } from './inline'
import { ScopeAsk } from './ScopeAsk'
import { BUTTON, LINK } from './buttonStyles'
import { useForgetRecent, useRecordRecent } from '../recent'

/**
 * ONE MEETING, in the shell's detail pane -- the same pane a task and a person open in.
 *
 * What is open is an OCCURRENCE, not a series -- this Tuesday's one. Changing it has to ask
 * which one you mean, and only for the things that can differ between two occurrences. Everything
 * else is the series', and changes all of them.
 *
 * The two fields that are real fields here are the clock and the zone. A time is composed, so
 * `datetime-local` is the control every browser already has for composing one; it still writes on
 * leaving, like everything else in this pane. There is no Save.
 */
/**
 * The pane: this module's fields inside the shell's frame.
 *
 * The FIELDS are a component of their own because the meeting's own page shows the same ones with
 * no frame around them (`relations.Head`). One editor, two places -- a second copy drifts.
 */
/** `PickOne` has no null value, so "belongs to nothing" needs a value of its own. */
const NO_PROJECT = '__no-project'

/** The same, for a meeting that happens once. */
const NO_REPEAT = '__none'

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
  useRecordRecent({
    type: 'meeting',
    id: meeting.meetingId,
    title: meeting.title,
    to: `/meetings/${meeting.meetingId}`,
    kind: 'Meeting',
  })
  return (
    <DetailPane label="Meetings" onClose={onClose}>
      <MeetingFields meeting={meeting} accountZone={accountZone} onClose={onClose} />

      {/* 这场会连着什么：谁在场是写在这场会上的，而「这件活是这次会之后才有的」是从另一端写的。
          一个人的那一层、一条任务的面板早就有这一块，会议是最后一个补上的。 */}
      <LinkedSection
        of={{ type: 'meeting', id: meeting.meetingId }}
        except={['person']}
        className="mt-4"
      />
      {/*
        取消留在面板里，而删一个人不留 —— 两者不是一回事。

        取消一场会是在日历上做的排期动作：你正看着那一格，决定这周不开。它要走到这场会自己那一页
        才能做的话，日历就废了一半。删一个人毁掉的是整条记录，那是另一种动作，所以它只在那个人
        自己那一页的最底下。
      */}
      <DangerZone>
        <CancelMeeting meeting={meeting} onCancelled={onClose} />
      </DangerZone>
    </DetailPane>
  )
}

export function MeetingFields({
  meeting,
  accountZone,
  onClose,
}: {
  meeting: MeetingOccurrence
  accountZone: string
  /** Where to go when the meeting is cancelled. A page has nowhere to close TO, so it may omit it. */
  onClose?: () => void
}) {
  const qc = useQueryClient()
  const rail = useProjectRail()
  const [editing, setEditing] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** A change waiting on "this one / from here on". Null when nothing is being asked. */
  const [asking, setAsking] = useState<{ what: string; patch: UpdateMeetingInput } | null>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const people = useQuery({ queryKey: ['people', null, false], queryFn: () => listPeople() })

  const repeats = meeting.rrule !== null
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['meetings'] })
    await qc.invalidateQueries({ queryKey: ['meeting-calendar'] })
    await qc.invalidateQueries({ queryKey: ['links'] })
  }

  const save = useMutation({
    mutationFn: (patch: UpdateMeetingInput) => patchMeeting(meeting.meetingId, patch),
    onSuccess: () => setFailed(null),
    onError: (e) => setFailed(e instanceof Error ? e.message : "Couldn't save it"),
    onSettled: refresh,
  })

  const chip = (id: string) => (
    <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />
  )

  /**
   * 存这一张表。
   *
   * 改了「什么时候」或者「多长」而这场会又是重复的，就要问一次「只这一次，还是从这次起」——
   * 那是日历都会问的那个问题，也是唯一猜不出来的那个。以前每动一个控件就问一次；现在一张表只
   * 问一次，而且问的是这一次保存里真正改到的那件事。
   */
  const submit = (patch: UpdateMeetingInput) => {
    const { startsLocal, durationMinutes, ...series } = patch
    const when: UpdateMeetingInput = {}
    if (startsLocal !== undefined) when.startsLocal = startsLocal
    if (durationMinutes !== undefined) when.durationMinutes = durationMinutes
    const movedWhen = Object.keys(when).length > 0

    // 标题、地点、在场的人、规则本身：都是这个系列的，从来不问。
    save.mutate({ ...series, scope: 'all' })
    if (!movedWhen) {
      setEditing(false)
      return
    }
    // 什么时候、多长：重复的会才有「只这一次，还是从这次起」可问；一次性的没得问。
    if (!repeats) {
      save.mutate({ ...when, scope: 'all' })
      setEditing(false)
      return
    }
    setAsking({ what: 'This meeting repeats. Which occurrences does this change?', patch: when })
  }

  const head = (
    <div>
      {onClose ? (
        <DetailHead
          kind={
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-muted">
              <Link to="/meetings" className="rounded hover:text-ink hover:underline">
                ← Meetings
              </Link>
              {meeting.overridden && <span className="text-xs text-ink-subtle">Edited</span>}
            </span>
          }
          trailing={
            <Link
              to={`/meetings/${meeting.meetingId}`}
              aria-label="Open as a page"
              title="Open as a page"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-hover hover:text-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
                <path
                  d="M6.5 3.5h6v6M12.5 3.5l-8 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          }
          onClose={onClose}
        />
      ) : (
        meeting.overridden && <span className="text-xs text-ink-subtle">Edited</span>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {head}

      {/* Above the form, beside the Save that raised them: the form's Cancel / Save sit at its
          top, and a question asked below the notes was a screen away from the press. */}
      {asking && (
        <ScopeAsk
          what={asking.what}
          onPick={(scope) => {
            save.mutate({ ...asking.patch, scope, recurrenceId: meeting.recurrenceId })
            setAsking(null)
            setEditing(false)
          }}
          onCancel={() => setAsking(null)}
          // Back to the form, which is still open under it -- and the form has a Cancel of its
          // own two rows down, which this must not be confused with.
          back="Keep editing"
        />
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {failed}
        </p>
      )}

      {editing ? (
        <MeetingForm
          meeting={meeting}
          accountZone={accountZone}
          projects={projects.data ?? []}
          people={people.data ?? []}
          chip={chip}
          busy={save.isPending}
          onCancel={() => setEditing(false)}
          onSave={submit}
        />
      ) : (
        <MeetingRead meeting={meeting} accountZone={accountZone} onEdit={() => setEditing(true)} />
      )}
    </div>
  )
}

/**
 * 读一场会：每个值都是文字，整块里只有一个 Edit 可以按。
 *
 * 和一个人那一层同一套（`PersonFields`），因为它们是同一个人在同一块屏幕上读的两种东西。
 */
function MeetingRead({
  meeting,
  accountZone,
  onEdit,
}: {
  meeting: MeetingOccurrence
  accountZone: string
  onEdit: () => void
}) {
  const rail = useProjectRail()
  const elsewhere = meeting.timeZone !== accountZone
  const place = meetingLink(meeting.location)
  const bare = meeting.rrule ? withUntil(meeting.rrule, null) : null
  const until = untilOf(meeting.rrule)
  // The meeting's own wall clock and its last day, in the words every other date in the app
  // uses (`Oct 19, 18:00`) -- not `2026-10-19 18:00`, the wire format, beside a "Your time" that
  // already says it the other way.
  const today = todayIn(accountZone)
  const when = `${shortDay(meeting.startsLocal.slice(0, 10), today)}, ${meeting.startsLocal.slice(11, 16)}`

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 data-detail-title className="truncate text-lg font-semibold text-ink">
            {meeting.title}
          </h2>
          <p className="truncate text-sm text-ink-muted tabular-nums">
            {when} · {zoneLabel(meeting.timeZone, new Date(meeting.startsAt))}
          </p>
        </div>
        <button type="button" className={BUTTON.secondary} onClick={onEdit}>
          Edit
        </button>
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          {elsewhere && (
            <Field label="Your time" shape="above">
              {/* 同一场会在你自己的钟上 —— 你得到场的那个时刻。改不了：时间是在对方那个时区
                  谈定的，在这里改它等于改一个换算。 */}
              <span data-local-clock className="text-sm tabular-nums text-ink-muted">
                {new Intl.DateTimeFormat('en-US', {
                  timeZone: accountZone,
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }).format(new Date(meeting.startsAt))}
              </span>
            </Field>
          )}
          <Field label="Length" shape="above">
            <span className="text-sm text-ink">{lengthLabel(meeting.durationMinutes)}</span>
          </Field>
          <Field label="Repeats" shape="above">
            <span className="text-sm text-ink">
              {bare ? repeatLabel(bare, meeting.startsLocal, today) : 'Once'}
            </span>
          </Field>
          {bare && (
            <Field label="Ends" shape="above">
              <span className="text-sm tabular-nums text-ink">
                {until ? shortDay(until, today) : 'Never'}
              </span>
            </Field>
          )}
          <Field label="Projects" shape="above">
            {/* A chip, like a person's projects, and the same words for none. */}
            {meeting.projectId && meeting.projectName ? (
              <span className="flex">
                <span className={CHIP}>
                  <span
                    className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(meeting.projectId)}`}
                  />
                  <span className="truncate">{meeting.projectName}</span>
                </span>
              </span>
            ) : (
              <span className="text-sm text-ink-subtle">Not on any project</span>
            )}
          </Field>
        </div>
      </div>

      <Field label="Location" shape="above">
        <span className="flex min-w-0 items-center gap-1.5">
          {meeting.location ? (
            place ? (
              <a
                href={place}
                target="_blank"
                rel="noreferrer"
                className={`min-w-0 flex-1 truncate text-sm ${LINK}`}
              >
                {meeting.location}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{meeting.location}</span>
            )
          ) : (
            <span className="text-sm text-ink-subtle">Not set</span>
          )}
        </span>
      </Field>

      <Field label="Attendees" shape="above">
        <div data-attendees className="flex flex-wrap gap-1.5">
          {meeting.attendees.length === 0 ? (
            <span className="text-sm text-ink-subtle">Nobody yet</span>
          ) : (
            meeting.attendees.map((p) => (
              <span key={p.id} className={CHIP}>
                {p.name}
              </span>
            ))
          )}
        </div>
      </Field>

      <Field label="Notes" shape="above">
        {meeting.note ? (
          <p className="max-w-[68ch] text-sm whitespace-pre-wrap text-ink">{meeting.note}</p>
        ) : (
          <p className="text-sm text-ink-subtle">No notes yet</p>
        )}
      </Field>
    </>
  )
}

/** 一场会多长，写给人看：`1 h`、`45 min`。 */
function lengthLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60} h` : `${minutes} min`
}

/**
 * 改一场会：一张表，一次保存。
 *
 * 和一个人那张表同一套出口（Save / Cancel），同一条规矩：取消不在这里 —— 它在阅读态的最底下。
 */
function MeetingForm({
  meeting,
  accountZone,
  projects,
  people,
  chip,
  busy,
  onCancel,
  onSave,
}: {
  meeting: MeetingOccurrence
  /** The reader's own zone, for the one date this form has to WORD rather than take as input. */
  accountZone: string
  projects: { id: string; name: string; archivedAt: string | null }[]
  people: { id: string; name: string }[]
  chip: (id: string) => ReactNode
  busy: boolean
  onCancel: () => void
  onSave: (patch: UpdateMeetingInput) => void
}) {
  const today = todayIn(accountZone)
  const [title, setTitle] = useState(meeting.title)
  const [startsLocal, setStartsLocal] = useState(meeting.startsLocal)
  const [timeZone, setTimeZone] = useState(meeting.timeZone)
  const [durationMinutes, setDuration] = useState(meeting.durationMinutes)
  const [rule, setRule] = useState(meeting.rrule ? withUntil(meeting.rrule, null) : NO_REPEAT)
  const [until, setUntil] = useState(untilOf(meeting.rrule))
  const [location, setLocation] = useState(meeting.location ?? '')
  const [projectId, setProjectId] = useState(meeting.projectId ?? NO_PROJECT)
  const [attendeeIds, setAttendees] = useState(meeting.attendees.map((p) => p.id))
  const [note, setNote] = useState(meeting.note ?? '')
  const composing = useComposing()
  const choices = repeatChoices(meeting.startsLocal)

  const submit = () => {
    if (busy || title.trim() === '' || startsLocal === '') return
    const rrule = rule === NO_REPEAT ? null : withUntil(rule, until)
    const patch: UpdateMeetingInput = {
      title: title.trim(),
      timeZone,
      location: location.trim() || null,
      projectId: projectId === NO_PROJECT ? null : projectId,
      attendeeIds,
      note: note.trim() || null,
      rrule,
    }
    // 只有真改过才发：时间那一项一旦出现在补丁里，重复的会就要被问一次范围。
    if (startsLocal !== meeting.startsLocal) patch.startsLocal = startsLocal
    if (durationMinutes !== meeting.durationMinutes) patch.durationMinutes = durationMinutes
    onSave(patch)
  }

  return (
    <form
      aria-label="Edit meeting"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      {...composing.bind}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-ink-muted">Editing</span>
        <button type="button" className={BUTTON.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={BUTTON.primary} disabled={busy || title.trim() === ''}>
          Save
        </button>
      </div>

      <div>
        <label htmlFor="m-title" className={label}>
          Title
        </label>
        <input
          id="m-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <div className="col-span-full">
            <Field label="Start" shape="above">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <input
                  type="datetime-local"
                  aria-label="Start"
                  value={startsLocal}
                  onChange={(e) => setStartsLocal(e.target.value)}
                  className={`${boxed} h-8 py-0 text-sm tabular-nums`}
                />
                {/* 时区是这场会的：「多伦多时间九点」是谈定的那件事，不管你这儿的钟怎么说。
                    这张单子里的缩写按**现在**读：这一列是在给时区起名字，而不是在说这场会是
                    哪个缩写 —— 那一句在上面标题下的那行，按会议自己的那一刻算。 */}
                <PickOne
                  label="Time zone"
                  value={timeZone}
                  choices={ZONES.map((z) => ({ value: z, label: zoneLabel(z, new Date()) }))}
                  onPick={setTimeZone}
                />
              </div>
            </Field>
          </div>
          <Field label="Length" shape="above">
            <PickOne
              label="Length"
              value={String(durationMinutes)}
              choices={[15, 30, 45, 60, 90, 120].map((m) => ({
                value: String(m),
                label: lengthLabel(m),
              }))}
              onPick={(m) => setDuration(Number(m))}
            />
          </Field>
          <Field label="Repeats" shape="above">
            <PickOne
              label="Repeats"
              value={rule}
              /* 匹配时不带结束日期，所以一个「每周、到十二月为止」的会仍然是「每周」那一项。
                 菜单里没有的规则，只要它是当前值就留着 —— 否则控件会为一个它持有的值显示占位符。 */
              choices={[
                ...choices.map((c) => ({ value: c.value ?? NO_REPEAT, label: c.label })),
                ...(rule !== NO_REPEAT && !choices.some((c) => c.value === rule)
                  ? [{ value: rule, label: repeatLabel(rule, meeting.startsLocal, today) }]
                  : []),
              ]}
              onPick={setRule}
            />
          </Field>
          {rule !== NO_REPEAT && (
            <Field label="Ends" shape="above">
              <span className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Ends"
                  value={until ?? ''}
                  min={meeting.startsLocal.slice(0, 10)}
                  onChange={(e) => setUntil(e.target.value || null)}
                  className={`${boxed} text-sm`}
                />
                {until ? (
                  <button type="button" onClick={() => setUntil(null)} className={BUTTON.inline}>
                    Never
                  </button>
                ) : (
                  <span className="text-sm text-ink-subtle">Never</span>
                )}
              </span>
            </Field>
          )}
          <Field label="Projects" shape="above">
            <PickOne
              label="Projects"
              value={projectId}
              /* 「No project」是一个选项，不只是占位符：归错了项目的会可以被挪走，但从前挪不回
                 「没有」。 */
              choices={[
                { value: NO_PROJECT, label: 'No project' },
                ...projects
                  .filter((p) => !p.archivedAt)
                  .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) })),
              ]}
              onPick={setProjectId}
            />
          </Field>
        </div>
      </div>

      <div>
        <label htmlFor="m-place" className={label}>
          Location
        </label>
        <input
          id="m-place"
          value={location}
          placeholder="A room, an address, or a link"
          onChange={(e) => setLocation(e.target.value)}
          className={`${field} mt-1.5 text-sm`}
        />
      </div>

      <Field label="Attendees" shape="above">
        <div data-attendees>
          <PickMany
            label="Attendees"
            chosen={attendeeIds.map((id) => ({
              value: id,
              label: people.find((c) => c.id === id)?.name ?? '',
            }))}
            choices={people.map((p) => ({ value: p.id, label: p.name }))}
            onChange={setAttendees}
            empty="Nobody yet"
          />
        </div>
      </Field>

      <div>
        <label htmlFor="m-note" className={label}>
          Notes
        </label>
        <textarea
          id="m-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className={`${field} mt-1.5 max-w-[68ch]`}
        />
      </div>
    </form>
  )
}

/**
 * CANCELLING THIS MEETING, for whichever surface is showing it.
 *
 * A repeating meeting is asked WHICH occurrences rather than yes/no -- the same question every
 * calendar asks, and the one answer that cannot be guessed. A one-off has only itself, so it gets
 * the plain question.
 */
export function CancelMeeting({
  meeting,
  onCancelled,
}: {
  meeting: MeetingOccurrence
  onCancelled?: () => void
}) {
  const qc = useQueryClient()
  const forget = useForgetRecent()
  const drop = useMutation({
    mutationFn: (scope: EditScope) =>
      cancelMeeting(meeting.meetingId, { scope, recurrenceId: meeting.recurrenceId }),
    onSuccess: async (_, scope) => {
      // One week of a series cancelled leaves the series; the whole of it does not.
      if (scope === 'all') forget('meeting', meeting.meetingId)
      await qc.invalidateQueries({ queryKey: ['meetings'] })
      await qc.invalidateQueries({ queryKey: ['meeting-calendar'] })
      onCancelled?.()
    },
  })
  return (
    <DangerAction
      label="Cancel meeting"
      confirmLabel="Confirm cancelling this meeting"
      message={`Cancel “${meeting.title}”? This cannot be undone.`}
      // A meeting is cancelled, not deleted, and a way out called "Cancel" next to it would say
      // the opposite of what it does.
      confirm="Cancel meeting"
      back="Keep it"
      busy={drop.isPending}
      onConfirm={() => drop.mutate('all')}
    >
      {meeting.rrule
        ? (close) => (
            <ScopeAsk
              what={`Cancel which occurrences of “${meeting.title}”?`}
              onPick={(scope) => drop.mutate(scope)}
              onCancel={close}
              destroys
              back="Keep it"
            />
          )
        : undefined}
    </DangerAction>
  )
}
