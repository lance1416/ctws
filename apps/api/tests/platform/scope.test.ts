import { workspaceId } from '@ctws/contracts'
import { sql, type SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { people } from '../../src/modules/people/tables'
import { liveUnder, type Scope, scoped, within } from '../../src/platform/db/scope'
import { links } from '../../src/shell/links/tables'
import { projects } from '../../src/shell/projects/tables'

const ws = workspaceId.parse('0190e8a1-0000-7000-8000-000000000001')
const render = (q: SQL) => {
  const { sql: text, params } = new PgDialect().sqlToQuery(q)
  return { sql: text, params }
}

describe('scope', () => {
  it('is the only way into a query, and cannot be an arbitrary condition', () => {
    expectTypeOf<SQL>().not.toExtend<Scope>()
    expectTypeOf<SQL | undefined>().not.toExtend<Parameters<typeof within>[0]>()
    expectTypeOf(scoped(people, ws)).toEqualTypeOf<Scope>()
  })

  it('keeps live rows of a soft-deleting table, every row of one that deletes for real', () => {
    expect(render(scoped(people, ws))).toEqual({
      sql: '(people.workspace_id = $1 and people.deleted_at is null)',
      params: [ws],
    })
    expect(render(scoped(links, ws, 'l'))).toEqual({
      sql: '(l.workspace_id = $1)',
      params: [ws],
    })
  })

  it('reaches a row through its parent', () => {
    expect(render(liveUnder('t', scoped(projects, ws, 'p'))).sql).toBe(
      '(t.deleted_at is null and (p.workspace_id = $1 and p.deleted_at is null))',
    )
  })

  it('keeps the scope when a condition is absent', () => {
    expect(render(within(scoped(links, ws), undefined, sql`true`)).sql).toBe(
      '((links.workspace_id = $1) and true)',
    )
  })
})
