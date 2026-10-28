import {
  api,
  type CommunicationId,
  type CommunicationResponse,
  type CreateCommunicationBody,
  type UpdateCommunicationBody,
} from '@ctws/contracts'
import { queryOptions } from '@tanstack/react-query'
import { call } from '../../platform/http/api'

/** This module's query keys. Every one starts with `'communication'`, so `all` reaches each. */
export const communicationKeys = {
  all: ['communication'] as const,
  overview: ['communication', 'overview'] as const,
  awaiting: ['communication', 'awaiting'] as const,
  followUps: ['communication', 'followups'] as const,
  recent: ['communication', 'recent'] as const,
  one: (id: string) => ['communication', 'one', id] as const,
}

/** Every message awaiting a reply, and the organisations in touch lately (FR-071). */
export const overviewQuery = () =>
  queryOptions({
    queryKey: communicationKeys.overview,
    queryFn: ({ signal }) =>
      call(api.communication.overview, { query: { view: 'overview' } }, { signal }),
  })

/** The sidebar's Awaiting reply: every one still waiting, the soonest follow-up first. */
export const awaitingQuery = () =>
  queryOptions({
    queryKey: communicationKeys.awaiting,
    queryFn: async ({ signal }) =>
      (await call(api.communication.awaiting, { query: { view: 'awaiting' } }, { signal }))
        .awaiting,
  })

/** Those due to be followed up today or before, for Today (FR-079). */
export const followUpsQuery = () =>
  queryOptions({
    queryKey: communicationKeys.followUps,
    queryFn: async ({ signal }) =>
      (await call(api.communication.followUps, { query: { view: 'followups' } }, { signal }))
        .awaiting,
  })

/** The newest exchanges, the sidebar's Recent: the first page is plenty. */
export const recentQuery = () =>
  queryOptions({
    queryKey: communicationKeys.recent,
    queryFn: async ({ signal }) =>
      (await call(api.communication.list, { query: {} }, { signal })).communications,
  })

export const messageQuery = (id: CommunicationId) =>
  queryOptions({
    queryKey: communicationKeys.one(id),
    queryFn: ({ signal }) => call(api.communication.get, { params: { id } }, { signal }),
  })

export function logMessage(body: CreateCommunicationBody): Promise<CommunicationResponse> {
  return call(api.communication.create, { body })
}

export function patchMessage(
  id: CommunicationId,
  body: UpdateCommunicationBody,
): Promise<CommunicationResponse> {
  return call(api.communication.update, { params: { id }, body })
}

/** "Log the reply": a received message from the same parties, closing the wait (FR-048). */
export function logReply(
  id: CommunicationId,
  body: Pick<
    CreateCommunicationBody,
    'channel' | 'occurredAt' | 'subject' | 'body' | 'attachments'
  >,
): Promise<CommunicationResponse> {
  return call(api.communication.reply, { params: { id }, body })
}

export function deleteMessage(id: CommunicationId): Promise<void> {
  return call(api.communication.remove, { params: { id } })
}
