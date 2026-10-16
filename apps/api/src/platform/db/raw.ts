import { getTableColumns, type InferSelectModel, sql, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { ident } from './sql'

/**
 * A raw query names a table's columns by this list and reads them back with `columnShape`, so the
 * columns are written down once, in the table.
 */
export function columnsOf(table: PgTable, alias: string): SQL {
  return sql.join(
    Object.entries(getTableColumns(table)).map(
      ([field, column]) => sql`${ident(alias)}.${ident(column.name)} as ${sql.identifier(field)}`,
    ),
    sql`, `,
  )
}

type Shape<T extends PgTable> = {
  [K in keyof InferSelectModel<T>]-?: z.ZodType<InferSelectModel<T>[K]>
}

/**
 * How a raw row's columns of `table` are read: each decoded as the query builder decodes it (a
 * `timestamptz` into a Date), and a null refused where the column cannot hold one.
 */
export function columnShape<T extends PgTable>(table: T): Shape<T> {
  const fields = Object.entries(getTableColumns(table)).map(([field, column]) => [
    field,
    z.unknown().transform((value, ctx) => {
      if (value !== null && value !== undefined) return column.mapFromDriverValue(value)
      if (!column.notNull) return null
      ctx.addIssue({ code: 'custom', message: `${column.name} is null` })
      return z.NEVER
    }),
  ])
  // The decoders are built per column at run time; the table's own types say what each returns.
  return Object.fromEntries(fields) as Shape<T>
}

/** The one way out of a raw query: every row read by `row`, or the request fails loudly. */
export function rowsOf<Row extends z.ZodType>(
  result: { rows: unknown[] },
  row: Row,
): z.output<Row>[] {
  return z.array(row).parse(result.rows)
}
