import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE KIND IS CALLED PEOPLE, IN EVERY LAYER.
 *
 * It was "contacts" in the tables, the routes, the types and the copy, and "People" only in the
 * product statement. A name that means one thing in the interface and another in the code is a
 * translation every later change has to pay for, so the rename went all the way down and this
 * keeps it there.
 *
 * Applied migrations under `drizzle/` are not walked: they are history, and editing one would make
 * a database that already ran it disagree with one that runs it fresh.
 */
const ROOTS = ['../src', '../../../packages/contracts/src'].map((p) => join(import.meta.dirname, p))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('the old name', () => {
  it('appears nowhere in the API or the contracts', () => {
    const hits = ROOTS.flatMap((root) =>
      sources(root).flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) =>
            /contact/i.test(line)
              ? [`${relative(join(root, '..'), file)}:${i + 1}: ${line.trim()}`]
              : [],
          ),
      ),
    )
    expect(hits).toEqual([])
  })
})
