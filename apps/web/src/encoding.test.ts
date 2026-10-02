import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

// A string written with a broken encoding turns into U+FFFD replacement characters. That passes
// typecheck, formatting, the build and every test that does not render the exact string, so it
// ships silently and is first noticed by a user seeing garbage. The UI text is Chinese, so
// guard every source file.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : []
  })
}

// Built from the code point so this file never contains the character itself.
const REPLACEMENT = String.fromCodePoint(0xfffd)

test('no source file under src contains a U+FFFD replacement character', () => {
  const offenders = sourceFiles(__dirname).filter((f) =>
    readFileSync(f, 'utf8').includes(REPLACEMENT),
  )
  expect(offenders).toEqual([])
})
