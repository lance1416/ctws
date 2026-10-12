import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE KIND IS CALLED PEOPLE, IN EVERY LAYER.
 *
 * It was "contacts" in the routes, the files, the identifiers and the words on screen, and "People"
 * in the product statement. A name that means one thing on screen and another in the code is a
 * translation every later change has to pay for, so the rename went all the way down and this
 * keeps it there.
 *
 * The one survivor is the old ADDRESS: a bookmark to `/contacts/<id>` still lands on that person.
 * It may appear only in the redirect table and in the test that proves the redirect.
 */
const WEB = join(import.meta.dirname, '..')
const ROOTS = ['src', 'e2e'].map((d) => join(WEB, d))
const OLD_ADDRESS_MAY_APPEAR_IN = new Set(['src/main.tsx', 'e2e/people.spec.ts'])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    // This file has to name the old word to look for it.
    if (path === import.meta.filename) return []
    return /\.(tsx?|css)$/.test(name) ? [path] : []
  })
}

describe('the old name', () => {
  it('appears nowhere in the web app, except as an old address being redirected', () => {
    const hits = ROOTS.flatMap((root) =>
      sources(root).flatMap((file) => {
        const where = relative(WEB, file).replaceAll('\\', '/')
        return readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) => {
            if (!/contact/i.test(line)) return []
            if (OLD_ADDRESS_MAY_APPEAR_IN.has(where) && /\/contacts\b/.test(line)) return []
            return [`${where}:${i + 1}: ${line.trim()}`]
          })
      }),
    )
    expect(hits).toEqual([])
  })
})
