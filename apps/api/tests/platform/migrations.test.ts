import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE MIGRATION A DATABASE SILENTLY SKIPS.
 *
 * Drizzle's migrator applies an entry only when its `when` is later than the last one the
 * database recorded. A hand-written entry stamped with a round, made-up timestamp in the future
 * makes the next generated one -- which gets the real clock -- EARLIER, and a running stack skips
 * it without a word: the table simply does not exist.
 *
 * NOTHING ELSE CAN CATCH THIS. A fresh database applies every entry regardless of order, so the
 * whole suite stays green; the defect exists only for a database that has already migrated once.
 */
describe('migration journal', () => {
  const journal = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../drizzle/meta/_journal.json'), 'utf8'),
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
