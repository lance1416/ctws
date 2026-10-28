import { z } from 'zod'
import { calendarDate, documentText, instant, patchOf, titleText, viewQuery } from './common'
import { communicationId, objectId, organisationId, projectId } from './id'
import { projectStanding } from './organisation'
import { LIST_PAGE, pageInfo, pageQuery } from './page'

/**
 * A communication (FR-048): one exchange logged by hand, sent or received, by some channel, with
 * one or more people or organisations, about something. A sent one may wait for a reply by a
 * follow-up day; logging the reply closes it.
 */
export const DIRECTIONS = ['sent', 'received'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const CHANNELS = ['email', 'call', 'message', 'in_person', 'other'] as const
export type Channel = (typeof CHANNELS)[number]

/** How many days after sending a follow-up falls when none is given. */
export const FOLLOW_UP_DAYS = 5

/** Sent this long ago with no reply and no follow-up set: "No reply, N days" (FR-071). */
export const NO_REPLY_AFTER_DAYS = 7

const party = z.object({ type: z.enum(['person', 'organisation']), id: objectId }).strict()
export type Party = z.infer<typeof party>

const attachment = z
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'expected an http(s) url' })

export const communicationParams = z.object({ id: communicationId }).strict()

const communicationFields = {
  direction: z.enum(DIRECTIONS),
  channel: z.enum(CHANNELS),
  /** When it happened; the server's now when left out of a create. */
  occurredAt: instant,
  parties: z.array(party).min(1).max(20),
  subject: titleText.nullable(),
  body: documentText.nullable(),
  projectId: projectId.nullable(),
  attachments: z.array(attachment).max(20),
  /** Only a sent one waits. */
  awaitingReply: z.boolean(),
  followUpOn: calendarDate.nullable(),
}

export const createCommunicationBody = z
  .object(communicationFields)
  .partial()
  .required({ direction: true, channel: true, parties: true })
  .strict()
  .refine((b) => b.direction === 'sent' || !b.awaitingReply, {
    message: 'only a sent message waits for a reply',
    path: ['awaitingReply'],
  })
export type CreateCommunicationBody = z.infer<typeof createCommunicationBody>

export const updateCommunicationBody = patchOf(communicationFields)
export type UpdateCommunicationBody = z.infer<typeof updateCommunicationBody>

/** "Log the reply": a received message from the same parties, which closes the one it answers. */
export const replyBody = z
  .object({
    channel: z.enum(CHANNELS).optional(),
    occurredAt: instant.optional(),
    subject: titleText.nullish(),
    body: documentText.nullish(),
    attachments: z.array(attachment).max(20).optional(),
  })
  .strict()

/** A party as a row shows it: named by its module. */
const namedParty = z.object({
  type: z.enum(['person', 'organisation']),
  id: objectId,
  name: z.string(),
})

export const communicationResponse = z.object({
  id: communicationId,
  direction: z.enum(DIRECTIONS),
  channel: z.enum(CHANNELS),
  occurredAt: instant,
  parties: z.array(namedParty),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  projectId: projectId.nullable(),
  projectName: z.string().nullable(),
  attachments: z.array(z.string()),
  awaitingReply: z.boolean(),
  followUpOn: calendarDate.nullable(),
  /** The received message that answered this one, when one has. */
  repliedBy: communicationId.nullable(),
  /** The sent message this one answered. */
  replyTo: communicationId.nullable(),
  createdAt: instant,
  updatedAt: instant,
})
export type CommunicationResponse = z.infer<typeof communicationResponse>

export const communicationListQuery = z.object(pageQuery(LIST_PAGE)).strict()

export const communicationsResponse = z.object({
  communications: z.array(communicationResponse),
  page: pageInfo,
})

/** A sent message still waiting, with how it stands against today (FR-071, FR-079). */
const awaitingRow = communicationResponse.extend({
  /** Days since it was sent, on the account's calendar. */
  waitingDays: z.number().int().nonnegative(),
  /** Negative when the follow-up day has passed, zero on the day. */
  daysToFollowUp: z.number().int().nullable(),
})
export type AwaitingRow = z.infer<typeof awaitingRow>

export const awaitingResponse = z.object({ awaiting: z.array(awaitingRow) })

/** "Follow up": those whose follow-up day is today or past, for Today and the Workbench. */
export const followUpsQuery = viewQuery('followups')

/** What comes next with an organisation, said as the overview's "Next" column (FR-071). */
const nextStep = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('follow-up'), on: calendarDate, late: z.boolean() }),
  z.object({ kind: z.literal('no-reply'), days: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('nothing') }),
])

/** One organisation in touch lately: its last exchange and what is next. */
const organisationInTouch = z.object({
  organisationId,
  organisationName: z.string(),
  /** The project it stands furthest along in, and that node's stage (FR-064, FR-071). */
  standing: projectStanding.nullable(),
  /** People of that organisation the exchanges were with. */
  peopleCount: z.number().int().nonnegative(),
  lastContact: z.object({
    communicationId,
    direction: z.enum(DIRECTIONS),
    occurredAt: instant,
    subject: z.string().nullable(),
  }),
  next: nextStep,
})
export type OrganisationInTouch = z.infer<typeof organisationInTouch>

/**
 * The overview (FR-071): every message awaiting a reply and every organisation in touch in the last
 * 30 days. A page shows five of each and the rest behind "All N" (FR-015).
 */
export const communicationOverviewResponse = z.object({
  awaiting: z.array(awaitingRow),
  awaitingTotal: z.number().int().nonnegative(),
  inTouch: z.array(organisationInTouch),
  inTouchTotal: z.number().int().nonnegative(),
})
export type CommunicationOverviewResponse = z.infer<typeof communicationOverviewResponse>

/** "In touch": an exchange within this many days (FR-060, FR-071). */
export const IN_TOUCH_DAYS = 30
