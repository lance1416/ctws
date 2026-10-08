import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { WorkspaceModule } from './contract'
import {
  allChords,
  captureContribution,
  moduleDestinations,
  moduleRoutes,
  moduleWidgets,
  projectHeadlines,
  projectViews,
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
const NotesOnProject = () => null
const NotesProjectNumbers = () => null

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
  widgets: [{ id: 'recent', label: '最近的笔记', to: '/notes/recent', Component: () => null }],
  ProjectView: NotesOnProject,
  ProjectHeadline: NotesProjectNumbers,
}

const files: WorkspaceModule = {
  id: 'files',
  label: '文件',
  destinations: [{ id: 'drive', to: '/files/drive', label: '云盘' }],
  routes: [{ path: 'drive' }],
  capture: { useTarget: () => ({ target: null, missing: true, unavailable: false }) },
  widgets: [{ id: 'big', label: '占地方的', Component: () => null }],
  ProjectView: () => null,
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

describe('the workbench widgets', () => {
  it('collects every module card, in registration order, tagged with its module', () => {
    expect(moduleWidgets([notes, files]).map((w) => `${w.moduleId}:${w.id}`)).toEqual([
      'notes:recent',
      'files:big',
    ])
  })

  it('is empty for a module that contributes none, rather than inventing one', () => {
    const { widgets: _dropped, ...noWidgets } = notes
    expect(moduleWidgets([noWidgets, files])).toHaveLength(1)
  })
})

describe('the master key table', () => {
  it('merges the shell chords and every module chord into one ordered table', () => {
    const table = allChords([notes])
    // The shell's own keys are always there (`w` workbench, `p` projects); `n` is declared with
    // a lower order than `p`, so it slots between them -- the order is the table's, not the
    // registration sequence's.
    expect(table.map((c) => c.key)).toEqual(['w', 'n', 'p'])
    expect(table.map((c) => c.moduleId)).toEqual([null, 'notes', null])
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

/**
 * The project page is the SHELL's (contract §3) and the rows on it are a module's. These two
 * helpers are the seam that keeps it that way: without them the page would import the task
 * module's tree by name, and a second module's rows could never appear on a project at all.
 *
 * Both are asserted with modules that do not exist, because the real registry holds exactly one
 * module and a one-module assertion passes just as well against a hardwired page.
 */
describe('what a module hangs on a project page', () => {
  it('collects every module that has rows for a project, in registration order', () => {
    const views = projectViews([notes, files])
    expect(views.map((v) => v.moduleId)).toEqual(['notes', 'files'])
    expect(views.map((v) => v.moduleLabel)).toEqual(['笔记', '文件'])
    expect(views[0]!.Component).toBe(NotesOnProject)
  })

  it('collects the banner numbers separately, and skips a module that has none', () => {
    // `files` contributes rows but NO numbers. A helper that returned "every module with a
    // ProjectView" would hand the banner a component that does not exist.
    const headlines = projectHeadlines([notes, files])
    expect(headlines.map((h) => h.moduleId)).toEqual(['notes'])
    expect(headlines[0]!.Component).toBe(NotesProjectNumbers)
  })

  it('contributes nothing when no module is registered', () => {
    expect(projectViews([])).toEqual([])
    expect(projectHeadlines([])).toEqual([])
  })
})
