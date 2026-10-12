import { OBJECT_TYPES } from '@ctws/contracts'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { WorkspaceModule } from './contract'
import {
  allChords,
  MODULES,
  captureContribution,
  kinds,
  moduleRoutes,
  moduleWidgets,
  projectHeadlines,
  projectBlocks,
  relationFor,
  relations,
  PINNED,
  pinnedPages,
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
  label: 'Notes',
  // Offered, never pinned: only the shell's PINNED list decides what is at the top of the rail.
  pages: [{ id: 'recent', to: '/notes/recent', label: 'Recent' }],
  kind: { label: 'Notes', to: '/notes/all', order: 25 },
  routes: [{ path: 'recent' }, { path: 'all' }],
  capture: { useTarget: () => ({ target: null, missing: false, unavailable: false }) },
  search: { useHits: () => ({ hits: [], isError: false, isSuccess: true }) },
  chords: [
    { id: 'recent', key: 'n', label: 'Go to Recent', resolve: () => '/notes/recent', order: 5 },
  ],
  widgets: [{ id: 'recent', label: 'Recent notes', to: '/notes/recent', Component: () => null }],
  projectBlock: { Component: NotesOnProject },
  ProjectHeadline: NotesProjectNumbers,
}

const files: WorkspaceModule = {
  id: 'files',
  label: 'Files',
  kind: { label: 'Files', to: '/files/drive', order: 5 },
  routes: [{ path: 'drive' }],
  capture: { useTarget: () => ({ target: null, missing: true, unavailable: false }) },
  widgets: [{ id: 'big', label: 'Bulky', Component: () => null }],
  projectBlock: { Component: () => null },
}

describe("the rail's pinned pages", () => {
  it('are the four that cut across every kind, in reading order', () => {
    expect(pinnedPages().map((p) => p.label)).toEqual(['Workbench', 'Today', 'Calendar', 'Review'])
  })

  it('never number more than five', () => {
    // Every surveyed system puts the always-visible tier at three to five; past that it stops
    // being the tier that is always visible.
    expect(PINNED.length).toBeLessThanOrEqual(5)
  })

  it('are chosen by the shell, not offered into place by a module', () => {
    // The fakes offer a page and are not in PINNED, so only the shell's own two remain.
    expect(pinnedPages([notes, files]).map((p) => p.label)).toEqual(['Workbench', 'Calendar'])
  })
})

describe('the kinds of thing', () => {
  it("are every kind this workspace has, the shell's Projects first", () => {
    expect(kinds().map((k) => k.label)).toEqual([
      'Projects',
      'Tasks',
      'People',
      'Meetings',
      'Reading',
    ])
  })

  it('take one entry per module, in their stated order', () => {
    expect(kinds([notes, files]).map((k) => [k.moduleId, k.label])).toEqual([
      ['', 'Projects'],
      ['files', 'Files'],
      ['notes', 'Notes'],
    ])
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

describe('this workspace', () => {
  it('registers every module it has', () => {
    // A module that is imported and never added to the list is invisible: no rail row, no
    // calendar entries, no card -- and nothing else fails, so it looks like the module is broken
    // rather than absent. It has happened.
    expect(MODULES.map((m) => m.id)).toEqual(['tasks', 'reading', 'people', 'meetings'])
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
    // The shell's own keys are always there (`w` workbench, `c` calendar, `p` projects); `n` is
    // declared with a lower order than all but `w`, so it slots in after it -- the order is the
    // table's, not the registration sequence's.
    expect(table.map((c) => c.key)).toEqual(['w', 'n', 'c', 'p'])
    expect(table.map((c) => c.moduleId)).toEqual([null, 'notes', null, null])
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
    expect(providers.map((p) => p.moduleLabel)).toEqual(['Notes'])
  })
})

/**
 * The project page is the SHELL's and the rows on it are a module's. These two helpers are the seam
 * that keeps it that way: without them the page would import the task module's tree by name, and a
 * second module's rows could never appear on a project at all.
 *
 * Both are asserted with modules that do not exist, because the real registry holds exactly one
 * module and a one-module assertion passes just as well against a hardwired page.
 */
describe('what a module hangs on a project page', () => {
  it('collects every module that has rows for a project, in registration order', () => {
    const views = projectBlocks([notes, files])
    expect(views.map((v) => v.moduleId)).toEqual(['notes', 'files'])
    expect(views.map((v) => v.moduleLabel)).toEqual(['Notes', 'Files'])
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
    expect(projectBlocks([])).toEqual([])
    expect(projectHeadlines([])).toEqual([])
  })
})

/**
 * WHO ANSWERS FOR EACH KIND OF THING at the far end of an edge.
 *
 * The backlink panel is the shell's, so the shell has to be able to route to anything an edge
 * points at. A type nobody answers for would draw a row that cannot be opened -- which is a
 * registration mistake, and the only place it can be caught is here.
 */
describe('where another module keeps its things', () => {
  it('answers for every kind of thing the contract names', () => {
    const answered = relations().map((r) => r.type)
    expect([...answered].sort()).toEqual([...OBJECT_TYPES].sort())
    // One answer each: two modules claiming `meeting` would make the route depend on which was
    // registered first.
    expect(new Set(answered).size).toBe(answered.length)
  })

  it('keeps projects in the shell, and takes a type from a module that does not exist', () => {
    // The project entry survives every module being removed, because a project is the shell's.
    expect(relations([]).map((r) => r.type)).toEqual(['project'])
    expect(relationFor('project', [])?.to('p1')).toBe('/projects/p1')
    const withNotes = relationFor('reading', [
      { ...notes, relations: [{ type: 'reading', kind: 'Note', to: (id) => `/notes/${id}` }] },
    ])
    expect(withNotes?.moduleId).toBe('notes')
    expect(withNotes?.to('r1')).toBe('/notes/r1')
  })

  it('has no answer for a type no module claims', () => {
    expect(relationFor('person', [notes])).toBeNull()
  })
})
