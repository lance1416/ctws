import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/** The kind is called People in every layer; the old name stays out of the code. */
const WEB = join(import.meta.dirname, '..')
const ROOTS = ['src', 'e2e'].map((d) => join(WEB, d))

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
  it('appears nowhere in the web app', () => {
    const hits = ROOTS.flatMap((root) =>
      sources(root).flatMap((file) => {
        const where = relative(WEB, file).replaceAll('\\', '/')
        return readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) => {
            if (!/contact/i.test(line)) return []
            return [`${where}:${i + 1}: ${line.trim()}`]
          })
      }),
    )
    expect(hits).toEqual([])
  })
})
