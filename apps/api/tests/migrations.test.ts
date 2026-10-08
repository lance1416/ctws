import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE MIGRATION A DATABASE SILENTLY SKIPS.
 *
 * Drizzle's migrator applies an entry only when its `when` is later than the last one the
 * database recorded. Several of this project's migrations were hand-written with ROUND, MADE-UP
 * timestamps that happened to sit in the future; the next generated migration got the real clock
 * and was therefore EARLIER, so the running stack skipped it without a word and the table simply
 * did not exist.
 *
 * A fresh database applies everything regardless, which is why the whole suite stayed green while
 * this was broken: it is a defect that only exists for a database that has already migrated once.
 */
describe('migration journal', () => {
  const journal = JSON.parse(
    readFileSync(join(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string; when: number }[] }

  it('is ordered, and its timestamps increase with it', () => {
    const entries = journal.entries
    expect(entries.length).toBeGreaterThan(0)
    for (const [i, entry] of entries.entries()) {
      expect(entry.idx, `entry ${entry.tag} is out of order`).toBe(i)
      const previous = entries[i - 1]
      if (!previous) continue
      expect(
        entry.when,
        `${entry.tag} is stamped before ${previous.tag}, so a migrated database will skip it`,
      ).toBeGreaterThan(previous.when)
    }
  })
})
