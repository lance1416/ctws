import type { ObjectType, WorkspaceId } from '@ctws/contracts'
import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { Tx } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { likePattern, LIKE_ESCAPE } from '../../platform/db/sql'
import { instant } from '../../platform/db/time'
import type { TextSource } from '../module'
import { syncMentions } from '../relations'

/**
 * A text source over one column of a module's table: found by a case-blind match on any of the
 * words, rewritten only over the text that was read, its mentions kept in step, and the change
 * logged as the module logs that field.
 */
export function textSourceOf(def: {
  type: ObjectType
  table: PgTable
  id: AnyPgColumn
  workspace: AnyPgColumn
  text: AnyPgColumn
  /** Its name to mentions: which field of the thing the sentence is in. */
  field: string
  /** Set on a row that is deleted softly: such a row is not looked in. */
  deleted?: AnyPgColumn
  /** Written with the text, the module's "changed" stamp. */
  updated?: AnyPgColumn
  log(tx: Tx, ctx: Actor, id: string, was: string, next: string): Promise<void>
}): TextSource {
  const live = (workspaceId: WorkspaceId, more: SQL | undefined) =>
    and(eq(def.workspace, workspaceId), def.deleted ? isNull(def.deleted) : undefined, more)
  return {
    type: def.type,
    async find(q, workspaceId, words) {
      if (words.length === 0) return []
      const any = or(
        ...words.map((w) => sql`${def.text} ilike ${likePattern(w)} escape ${LIKE_ESCAPE}`),
      )
      const rows = await q
        .select({ id: def.id, text: def.text })
        .from(def.table)
        .where(live(workspaceId, any))
      return rows.flatMap((r) =>
        typeof r.text === 'string' ? [{ id: String(r.id), text: r.text }] : [],
      )
    },
    async read(q, workspaceId, id) {
      const [row] = await q
        .select({ text: def.text })
        .from(def.table)
        .where(live(workspaceId, eq(def.id, id)))
      return typeof row?.text === 'string' ? row.text : null
    },
    async rewrite(tx, ctx, id, was, next) {
      const [row] = await tx
        .select({ text: def.text })
        .from(def.table)
        .where(live(ctx.workspaceId, eq(def.id, id)))
        .for('update')
      if (row?.text !== was) return false
      // By the columns' own names: a SET takes them unqualified.
      const stamp = def.updated
        ? sql`, ${sql.identifier(def.updated.name)} = ${instant(ctx.now)}`
        : sql``
      await tx.execute(
        sql`update ${def.table} set ${sql.identifier(def.text.name)} = ${next}${stamp} where ${def.id} = ${id}`,
      )
      await def.log(tx, ctx, id, was, next)
      await syncMentions(tx, ctx, { type: def.type, id }, def.field, next)
      return true
    },
  }
}
