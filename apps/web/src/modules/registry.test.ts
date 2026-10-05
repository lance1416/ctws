import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { WorkspaceModule } from './contract'
import {
  allChords,
  captureContribution,
  homePath,
  moduleDestinations,
  moduleRoutes,
  resolveChord,
  searchProviders,
} from './registry'

/**
 * The seam itself, exercised with modules that do not exist.
 *
 * A test that only looked at the real registry would pass just as well against the hardwired
 * shell it replaced: one module cannot show that a SECOND one would be picked up. So these feed in
 * fakes -- a notes module and a files module -- and assert the shell would render, route, key and
 * search them.
 */
const notes: WorkspaceModule = {
  id: 'notes',
  label: '笔记',
  destinations: [
    { id: 'recent', to: '/notes/recent', label: '最近' },
    { id: 'all', to: '/notes/all', label: '全部' },
  ],
  routes: [{ path: 'recent' }, { path: 'all' }],
  capture: { useTarget: () => ({ target: null, missing: false, unavailable: false }) },
  search: { useHits: () => ({ hits: [], isError: false, isSuccess: true }) },
  chords: [
    { id: 'recent', key: 'n', label: '去「最近」', resolve: () => '/notes/recent', order: 5 },
  ],
}

const files: WorkspaceModule = {
  id: 'files',
  label: '文件',
  destinations: [{ id: 'drive', to: '/files/drive', label: '云盘' }],
  routes: [{ path: 'drive' }],
  capture: { useTarget: () => ({ target: null, missing: true, unavailable: false }) },
}

describe('destinations', () => {
  it('puts a module contribution in the rail, tagged with the module it came from', () => {
    const rail = moduleDestinations([notes, files])
    expect(rail.map((d) => d.label)).toEqual(['最近', '全部', '云盘'])
    expect(rail.map((d) => d.moduleId)).toEqual(['notes', 'notes', 'files'])
    expect(rail.map((d) => d.to)).toEqual(['/notes/recent', '/notes/all', '/files/drive'])
  })

  it('contributes nothing when no module is registered', () => {
    expect(moduleDestinations([])).toEqual([])
  })
})

describe('routes', () => {
  it('mounts each module under its own namespace', () => {
    expect(moduleRoutes([notes, files])).toEqual([
      { path: '/notes', children: notes.routes },
      { path: '/files', children: files.routes },
    ])
  })
})

describe('the home path', () => {
  it('is a destination the home module registered, not a literal', () => {
    expect(homePath([notes, files], 'notes', 'all')).toBe('/notes/all')
    expect(homePath([notes, files], 'files', 'drive')).toBe('/files/drive')
  })

  it('falls back to the module first destination, never to a path nobody registered', () => {
    expect(homePath([notes], 'notes', 'nonesuch')).toBe('/notes/recent')
    expect(() => homePath([{ ...notes, destinations: [] }], 'notes')).toThrow(
      /contributes no destination/,
    )
  })
})

describe('the master key table', () => {
  it('merges the shell chords and every module chord into one ordered table', () => {
    const table = allChords([notes])
    // `n` is declared with a lower order than the shell's `p`, so it leads -- the order is the
    // table's, not the registration sequence's.
    expect(table.map((c) => c.key)).toEqual(['n', 'p'])
    expect(table.map((c) => c.moduleId)).toEqual(['notes', null])
  })

  it('resolves a module chord to the module own path', () => {
    const qc = new QueryClient()
    expect(resolveChord('n', [notes])?.resolve({ queryClient: qc })).toBe('/notes/recent')
    expect(resolveChord('n', [files])).toBeNull()
    // The shell keeps its own key whatever is registered.
    expect(resolveChord('p', [])?.resolve({ queryClient: qc })).toBe('/projects')
  })
})

describe('the capture destination', () => {
  it('is the module NAMED as the default, not the first one that can capture', () => {
    // Both fakes can capture, and `files` is not first. A capture seam that fell through to
    // "whichever module is registered" would return the notes handler here.
    expect(captureContribution([notes, files], 'files').useTarget().missing).toBe(true)
    expect(captureContribution([notes, files], 'notes').useTarget().missing).toBe(false)
  })

  it('refuses to guess when the named module is not registered', () => {
    expect(() => captureContribution([notes], 'files')).toThrow(/not registered/)
    expect(() => captureContribution([], 'notes')).toThrow(/not registered/)
  })
})

describe('search providers', () => {
  it('collects every searchable module, with its own name for itself', () => {
    const providers = searchProviders([notes, files])
    // `files` contributes no search provider, so it is absent rather than empty.
    expect(providers.map((p) => p.moduleId)).toEqual(['notes'])
    expect(providers.map((p) => p.moduleLabel)).toEqual(['笔记'])
  })
})
