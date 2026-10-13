import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../../src')
// `… from '../x'` and the bare side-effect form `import '../x'`.
const IMPORT = /^\s*(?:(?:import|export)\b[^'"]*?\bfrom\s+|import\s+)['"](\.[^'"]+)['"]/gm

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

/** `platform`, `shell`, `modules/<kind>`, or `root` for the composition files. */
function layerOf(file: string): string {
  const [top, kind] = relative(SRC, file).split(/[\\/]/)
  if (top === 'modules') return `modules/${kind}`
  return top === 'platform' || top === 'shell' ? top : 'root'
}

const edges = () =>
  sources(SRC).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(IMPORT)].map(([, spec]) => {
      const target = resolve(dirname(file), spec!)
      return { from: layerOf(file), file: relative(SRC, file), to: layerOf(target), target }
    }),
  )

const isModuleEntry = (target: string) =>
  /^modules[\\/][^\\/]+([\\/]index)?$/.test(relative(SRC, target))

function allowed(from: string, to: string, target: string): boolean {
  if (from === 'root') return true
  if (from === 'platform') return to === 'platform'
  if (from === 'shell') return to === 'platform' || to === 'shell'
  if (to === 'platform' || to === 'shell' || to === from) return true
  return to.startsWith('modules/') && isModuleEntry(target)
}

describe('dependencies point down', () => {
  it('platform knows no layer above it, the shell knows no module', () => {
    const wrong = edges()
      .filter((e) => !allowed(e.from, e.to, e.target))
      .map((e) => `${e.file} -> ${relative(SRC, e.target)}`)
    expect(wrong).toEqual([])
  })

  it('no two modules depend on each other, even through others', () => {
    const graph = new Map<string, Set<string>>()
    for (const e of edges()) {
      if (e.from.startsWith('modules/') && e.to.startsWith('modules/') && e.to !== e.from) {
        graph.set(e.from, (graph.get(e.from) ?? new Set()).add(e.to))
      }
    }
    const reaches = (a: string, b: string, seen = new Set<string>()): boolean =>
      [...(graph.get(a) ?? [])].some(
        (n) => n === b || (!seen.has(n) && seen.add(n) && reaches(n, b, seen)),
      )
    expect([...graph.keys()].filter((m) => reaches(m, m))).toEqual([])
  })
})
