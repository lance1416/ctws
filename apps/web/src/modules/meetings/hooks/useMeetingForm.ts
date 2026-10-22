import {
  personId,
  projectId,
  ruleEndDay,
  type CreateMeetingBody,
  type MeetingOccurrence,
  type ProjectId,
  type UpdateSeriesBody,
} from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { DEFAULT_HOUR, DEFAULT_MINUTES, withUntil } from '../api'

/**
 * A meeting's fields as the new-meeting dialog and the pane's form hold them. The rule is held
 * without its ending, which has a control of its own: a weekly meeting that stops in December is
 * still "Weekly" in the menu. It needs a title and both halves of when it starts.
 */
export const meetingForm = z.object({
  title: z.string().refine((t) => t.trim() !== ''),
  startsLocal: z.string().refine((s) => s.split('T').every((part) => part !== '')),
  timeZone: z.string(),
  durationMinutes: z.number(),
  rule: z.string().nullable(),
  until: z.string().nullable(),
  location: z.string(),
  projectId: projectId.nullable(),
  attendeeIds: z.array(personId),
  note: z.string(),
})
export type MeetingForm = z.infer<typeof meetingForm>

/** A new meeting: today at the default hour, in the account's zone. */
/** A new meeting's form; in a project when made from one (FR-026, FR-055). */
export const newMeeting = (
  today: string,
  accountZone: string,
  projectId: ProjectId | null = null,
): MeetingForm => ({
  title: '',
  startsLocal: `${today}T${String(DEFAULT_HOUR).padStart(2, '0')}:00`,
  timeZone: accountZone,
  durationMinutes: DEFAULT_MINUTES,
  rule: null,
  until: null,
  location: '',
  projectId,
  attendeeIds: [],
  note: '',
})

/** The form opened on an occurrence. */
export const meetingValues = (meeting: MeetingOccurrence): MeetingForm => ({
  title: meeting.title,
  startsLocal: meeting.startsLocal,
  timeZone: meeting.timeZone,
  durationMinutes: meeting.durationMinutes,
  rule: meeting.rrule ? withUntil(meeting.rrule, null) : null,
  until: ruleEndDay(meeting.rrule),
  location: meeting.location ?? '',
  projectId: meeting.projectId,
  attendeeIds: meeting.attendees.map((p) => p.id),
  note: meeting.note ?? '',
})

/** What Create sends: what is empty is left out. */
export function createBody(v: MeetingForm): CreateMeetingBody {
  return {
    title: v.title.trim(),
    startsLocal: v.startsLocal,
    timeZone: v.timeZone,
    durationMinutes: v.durationMinutes,
    ...(v.rule ? { rrule: withUntil(v.rule, v.until) } : {}),
    ...(v.location.trim() ? { location: v.location.trim() } : {}),
    ...(v.projectId ? { projectId: v.projectId } : {}),
    ...(v.attendeeIds.length > 0 ? { attendeeIds: v.attendeeIds } : {}),
    ...(v.note.trim() ? { note: v.note.trim() } : {}),
  }
}

/** What Save sends for `meeting`. */
export function seriesPatch(v: MeetingForm, meeting: MeetingOccurrence): UpdateSeriesBody {
  const patch: UpdateSeriesBody = {
    title: v.title.trim(),
    timeZone: v.timeZone,
    location: v.location.trim() || null,
    projectId: v.projectId,
    attendeeIds: v.attendeeIds,
    note: v.note.trim() || null,
  }
  // Only when really changed: a rule in the patch makes the server drop the weeks moved or
  // cancelled on their own. Compared as the form reads it, not as stored: the server ends a split
  // series a minute before the split, which `withUntil` would rewrite to the end of that day.
  const opened = meetingValues(meeting)
  if (v.rule !== opened.rule || v.until !== opened.until) {
    patch.rrule = v.rule === null ? null : withUntil(v.rule, v.until)
  }
  // Only when really changed: either one in the patch makes a repeating meeting ask its scope.
  if (v.startsLocal !== meeting.startsLocal) patch.startsLocal = v.startsLocal
  if (v.durationMinutes !== meeting.durationMinutes) patch.durationMinutes = v.durationMinutes
  return patch
}

/** The form both the dialog and the pane draw, and whether it can be sent as it stands. */
export function useMeetingForm(opened: MeetingForm) {
  const form = useForm<MeetingForm>({
    resolver: zodResolver(meetingForm),
    defaultValues: opened,
    // Save is disabled until it can be sent; nothing is said, so focus stays where it is.
    shouldFocusError: false,
  })
  const values = form.watch()
  return { form, values, ready: meetingForm.safeParse(values).success }
}
