import type { ObjectType, TimelineEntry } from '@ctws/contracts'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { scoped, within } from '../../platform/db/scope'
import { afterCursor, events, type TimelineSource } from '../events'
import type { LinkRegistry } from '../links'
import { relations } from './tables'

/**
 * An organisation's timeline carries the stage changes of the tasks related to it (FR-065): what
 * a company's application moved to. The event is the task's own; the entry names the task and its
 * project, so the row can read "Stage set to Shortlisted in Find a lawyer".
 */
export const relatedStageChanges = (registry: LinkRegistry): TimelineSource => ({
  kind: 'change',
  read: async (q, workspaceId, subject, span) => {
    if (subject.type !== 'organisation') return []
    const rows = await q
      .select({
        id: events.id,
        objectId: events.objectId,
        payload: events.payload,
        at: events.occurredAt,
      })
      .from(events)
      .where(
        within(
          scoped(events, workspaceId),
          and(
            eq(events.objectType, 'task'),
            eq(events.type, 'stage_changed'),
            sql`${events.objectId} in (
              select x.from_id from relations x
              where x.workspace_id = ${workspaceId} and x.from_type = 'task'
                and x.to_type = 'organisation' and x.to_id = ${subject.id}
              union
              select x.to_id from relations x
              where x.workspace_id = ${workspaceId} and x.to_type = 'task'
                and x.from_type = 'organisation' and x.from_id = ${subject.id})`,
            afterCursor(span, 'change', { at: events.occurredAt, id: events.id }),
          ),
        ),
      )
      .orderBy(desc(events.occurredAt), desc(events.id))
      .limit(span.limit)
    if (rows.length === 0) return []
    const ids = [...new Set(rows.map((r) => r.objectId))]
    const tasks = new Map(
      (await registry.of('task').rows(q, workspaceId, { ids, limit: ids.length })).map((t) => [
        t.id,
        t,
      ]),
    )
    return rows.flatMap((r): TimelineEntry[] => {
      const task = tasks.get(r.objectId)
      if (!task || task.type !== 'task') return []
      const payload = z.object({}).passthrough().parse(r.payload)
      return [
        {
          kind: 'change',
          id: r.id,
          at: r.at.toISOString(),
          event: {
            type: 'stage_changed',
            payload: {
              ...payload,
              taskId: task.id,
              taskTitle: task.title,
              projectId: task.projectId,
              projectName: task.projectName,
            },
          },
        },
      ]
    })
  },
})

/**
 * Where a thing was mentioned, on its timeline (FR-042, FR-045): the sentence, and what it was
 * written in, named by that thing's own module through the registry. What this workspace cannot
 * see is left out.
 */
export const mentionSource = (registry: LinkRegistry): TimelineSource => ({
  kind: 'mention',
  read: async (q, workspaceId, subject, span) => {
    const rows = await q
      .select()
      .from(relations)
      .where(
        within(
          scoped(relations, workspaceId),
          and(
            eq(relations.toType, subject.type),
            eq(relations.toId, subject.id),
            eq(relations.origin, 'mention'),
            afterCursor(span, 'mention', { at: relations.createdAt, id: relations.id }),
          ),
        ),
      )
      .orderBy(desc(relations.createdAt), desc(relations.id))
      .limit(span.limit)
    const titles = new Map<string, string>()
    for (const type of new Set(rows.map((r) => r.fromType))) {
      const ids = rows.filter((r) => r.fromType === type).map((r) => r.fromId)
      for (const thing of await registry
        .of(type as ObjectType)
        .rows(q, workspaceId, { ids, limit: ids.length })) {
        titles.set(`${type}:${thing.id}`, thing.title)
      }
    }
    return rows.flatMap((r): TimelineEntry[] => {
      const title = titles.get(`${r.fromType}:${r.fromId}`)
      if (title === undefined || r.excerpt === null) return []
      return [
        {
          kind: 'mention',
          relationId: r.id,
          at: r.createdAt.toISOString(),
          from: { type: r.fromType, id: r.fromId, title },
          excerpt: r.excerpt,
        },
      ]
    })
  },
})
