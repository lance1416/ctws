import { sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { migratedTo } from '../helpers/db'
import { countOf, loadFixture } from '../helpers/fixtures'

/**
 * THE REDESIGN MIGRATION, RUN ON DATA WRITTEN UNDER THE OLD MODEL.
 *
 * `fixtures/pre-redesign.sql` is the "before the redesign" set from acceptance-data.md, made by
 * `tools/seed/pre-redesign.mjs` through the API at schema 0027 and dumped. It holds the cases the
 * migration guesses at: names that split several ways, companies written three ways, a parent set
 * to In progress by hand, a parent with a planned day, a series with a note, every kind of link.
 *
 * This file grows one `it` per rule in FR-090 to FR-099 as the migration is written. For now it
 * proves the fixture loads under 0027 and says how many of each thing it holds, so the counts the
 * migration must preserve are pinned here rather than in anyone's memory.
 */
const stops: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of stops.splice(0)) await stop()
})

/** What the fixture holds, counted when it was made (tools/seed/pre-redesign.mjs). */
const BEFORE = {
  projects: 7,
  tasks: 17,
  task_dependencies: 1,
  task_events: 18,
  people: 5,
  person_channels: 2,
  meetings: 2,
  meeting_exceptions: 1,
  reading_items: 2,
  links: 16,
}

describe('the pre-redesign fixture', () => {
  it('loads under the last pre-redesign schema with every row the seed wrote', async () => {
    const at = await migratedTo('0027_workspace_members_user_idx')
    stops.push(at.stop)
    await loadFixture(at.db, 'pre-redesign')

    for (const [table, n] of Object.entries(BEFORE)) {
      expect(await countOf(at.db, table), table).toBe(n)
    }
    const kinds = await at.db.execute(sql`select kind, count(*)::int as n from links group by kind`)
    expect(Object.fromEntries(kinds.rows.map((r) => [r.kind, r.n]))).toEqual({
      about: 4,
      attends: 3,
      belongs: 6,
      recommends: 3,
    })

    // Every later migration applies to it without complaint, and the task history crosses into
    // the shared change log row for row (0028).
    await at.migrateRest()
    expect(await countOf(at.db, "events where object_type = 'task'")).toBe(BEFORE.task_events)
    // The four `about` links are relations (0030). 0038 makes the rest the modules' own: the
    // three attendances rows of their meetings, the six `belongs` a field of a person, a meeting
    // or an item, and of
    // the three recommendations the first per item is its field, the other one a relation by hand.
    expect(await countOf(at.db, "relations where origin = 'manual'")).toBe(5)
    expect(await countOf(at.db, 'meeting_attendees')).toBe(3)
    expect(await countOf(at.db, 'person_projects')).toBe(3)
    expect(
      (await countOf(at.db, 'meetings where project_id is not null')) +
        (await countOf(at.db, 'reading_items where project_id is not null')),
    ).toBe(3)
    expect(await countOf(at.db, 'reading_items where recommended_by is not null')).toBe(2)
    expect(await countOf(at.db, "information_schema.tables where table_name = 'links'")).toBe(0)
  })
})
