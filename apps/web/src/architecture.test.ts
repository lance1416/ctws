import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = import.meta.dirname

type Layer = 'app' | 'platform' | 'shell' | `module:${string}` | 'root'

const files = (at: string): string[] =>
  readdirSync(at, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(at, e.name)) : /\.tsx?$/.test(e.name) ? [join(at, e.name)] : [],
  )

const posix = (p: string) => p.split(sep).join('/')

/** The layer a path under src belongs to, by its first one or two folders. */
function layerOf(path: string): Layer {
  const [top, second] = path.split('/')
  if (top === 'app' || top === 'platform' || top === 'shell') return top
  if (top === 'modules' && second) return `module:${second}`
  return 'root'
}

const SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.\.?\/[^'"]+)['"]/g

/** Every relative import in the given files, as `from → to` paths under src. */
function edges(sources: string[]): { from: string; to: string }[] {
  return sources.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(SPEC)].map((m) => ({
      from: posix(relative(SRC, file)),
      to: posix(relative(SRC, resolve(dirname(file), m[1]!))),
    })),
  )
}

/** Module-to-module imports that are allowed, always through the other module's index. */
const MODULE_EDGES = new Set(['meetings->people'])

/** Whether code in `from` may import `toPath`: downwards only, modules → shell → platform. */
function allowed(from: Layer, toPath: string): boolean {
  const to = layerOf(toPath)
  if (from === to || from === 'app' || from === 'root') return true
  if (to === 'platform') return true
  if (from === 'platform') return false
  if (to === 'shell') return from.startsWith('module:')
  if (from.startsWith('module:') && to.startsWith('module:')) {
    const pair = `${from.slice(7)}->${to.slice(7)}`
    return MODULE_EDGES.has(pair) && /^modules\/[^/]+(\/index)?$/.test(toPath)
  }
  return false
}

const production = files(SRC).filter((f) => !/\.test\.tsx?$/.test(f))
const violations = () =>
  edges(production)
    .filter((e) => !allowed(layerOf(e.from), e.to))
    .map((e) => `${e.from} -> ${e.to}`)

describe('dependency direction', () => {
  it('scans the whole tree', () => {
    expect(production.length).toBeGreaterThan(120)
    expect(edges(production).length).toBeGreaterThan(400)
  })

  it('imports only downwards: modules, then shell, then platform', () => {
    expect(violations()).toEqual([])
  })

  it('catches a planted violation', () => {
    expect(allowed('platform', 'shell/registry')).toBe(false)
    expect(allowed('shell', 'modules/tasks/index')).toBe(false)
    expect(allowed('shell', 'app/registry')).toBe(false)
    expect(allowed('module:meetings', 'modules/people/index')).toBe(true)
    expect(allowed('module:meetings', 'modules/people')).toBe(true)
    expect(allowed('module:meetings', 'modules/people/api/people')).toBe(false)
    expect(allowed('module:people', 'modules/meetings/index')).toBe(false)
    expect(allowed('module:tasks', 'shell/registry')).toBe(true)
    expect(allowed('app', 'modules/tasks')).toBe(true)
  })
})
