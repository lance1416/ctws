import { z } from 'zod'

/**
 * CONTACTS -- THE THIRD MODULE.
 *
 * The model is vCard 4.0's (RFC 6350), cut down to what one person needs: a formatted name (`FN`),
 * an organisation (`ORG`), free notes (`NOTE`), and a REPEATABLE set of ways to reach someone
 * (`EMAIL` / `TEL` / `URL`), each with an optional type label.
 *
 * The repeatable part is the whole reason to follow the standard rather than invent: a single
 * `email` column is the mistake every hand-rolled contact model makes, and it is wrong the first
 * time somebody has a work address and a personal one. vCard has said so since 1996.
 *
 * What is deliberately NOT modelled, because a personal workbench is not a CRM: organisations as
 * entities of their own, interaction history, photos, postal addresses, birthdays, and tags. Each
 * is a real vCard property and each would be answering a question nobody has asked here yet.
 */

/** vCard's `EMAIL`, `TEL` and `URL`. The three ways one person actually reaches another. */
export const CHANNEL_KINDS = ['email', 'phone', 'url'] as const
export const channelKind = z.enum(CHANNEL_KINDS)
export type ChannelKind = z.infer<typeof channelKind>

/**
 * One way to reach someone.
 *
 * `label` is vCard's TYPE parameter, left as free text rather than an enum: vCard's own list
 * (work, home, cell, …) is advisory, and "the one for interviews" is a more useful label than
 * anything a fixed set would offer.
 */
export const contactChannel = z
  .object({
    kind: channelKind,
    value: z.string().trim().min(1).max(500),
    label: z.string().trim().min(1).max(60).nullish(),
  })
  .strict()
export type ContactChannel = z.infer<typeof contactChannel>

const contactName = z.string().trim().min(1).max(200)
const org = z.string().trim().min(1).max(200)
const note = z.string().max(10_000)

/**
 * Channels are written as a WHOLE LIST, never one at a time.
 *
 * A contact's addresses are read, shown and edited together, so endpoints per channel would be
 * three more routes and a client that has to sequence them. The server replaces the set.
 */
const channels = z.array(contactChannel).max(20)

export const createContactBody = z
  .object({
    name: contactName,
    org: org.nullish(),
    note: note.nullish(),
    /** The lines of work this person is on. A person is often on several. */
    projectIds: z.array(z.uuid()).max(20).optional(),
    channels: channels.optional(),
  })
  .strict()
export type CreateContactBody = z.infer<typeof createContactBody>

export const updateContactBody = z
  .object({
    name: contactName.optional(),
    org: org.nullable().optional(),
    note: note.nullable().optional(),
    projectIds: z.array(z.uuid()).max(20).optional(),
    channels: channels.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'expected at least one field' })
export type UpdateContactBody = z.infer<typeof updateContactBody>

export const contactResponse = z
  .object({
    id: z.uuid(),
    name: z.string(),
    org: z.string().nullable(),
    note: z.string().nullable(),
    /**
     * The projects this person is on, named, so a list needs no second request.
     *
     * A LIST because a person is often on several: a maintainer who is on two of your repos, a
     * recruiter holding two roles open.
     */
    projects: z.array(z.object({ id: z.uuid(), name: z.string() }).strict()),
    channels: z.array(contactChannel),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
export type ContactResponse = z.infer<typeof contactResponse>

export const contactListQuery = z
  .object({
    projectId: z.uuid().optional(),
    /** Only the people who are on no project at all. */
    unfiled: z.enum(['true', 'false']).optional(),
  })
  .strict()
  .refine((q) => !(q.projectId && q.unfiled === 'true'), {
    message: 'unfiled and projectId cannot both be asked for',
  })
