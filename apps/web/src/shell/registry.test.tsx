import { QueryClient } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { WorkspaceModule } from './contract'
import { buildRegistry, useRegistry, type ShellConfig } from './registry'

/** Fake notes and files modules: one real module could not show that a second is picked up. */
const NotesOnProject = () => null
const NotesProjectNumbers = () => null
const NotesFacts = () => null
const FilesLead = () => null

const notes: WorkspaceModule = {
  id: 'notes',
  label: 'Notes',
  // Offered, never pinned: only the app's config decides what is at the top of the rail.
  pages: [{ id: 'recent', to: '/notes/recent', label: 'Recent' }],
  kind: { label: 'Notes', to: '/notes/all', order: 25 },
  routes: [{ path: 'recent' }, { path: 'all' }],
  capture: { useTarget: () => ({ target: null, missing: false, unavailable: false }) },
  search: { useHits: () => ({ hits: [], isError: false, isSuccess: true }) },
  chords: [
    { id: 'recent', key: 'n', label: 'Go to Recent', resolve: () => '/notes/recent', order: 5 },
  ],
  widgets: [{ id: 'recent', label: 'Recent notes', to: '/notes/recent', Component: () => null }],
  project: {
    Block: { Component: NotesOnProject },
    Headline: NotesProjectNumbers,
    Facts: NotesFacts,
    contents: async () => '3 notes',
  },
  help: [{ title: 'In a note', keys: [['e', 'Edit']] }],
}

const files: WorkspaceModule = {
  id: 'files',
  label: 'Files',
  kind: { label: 'Files', to: '/files/drive', order: 5 },
  routes: [{ path: 'drive' }],
  capture: { useTarget: () => ({ target: null, missing: true, unavailable: false }) },
  widgets: [{ id: 'big', label: 'Bulky', Component: () => null }],
  project: { Block: { Component: () => null }, Lead: FilesLead, contents: async () => null },
  help: [{ title: 'In the drive', keys: [['u', 'Upload']] }],
}

const CONFIG: ShellConfig = {
  pinned: ['shell:workbench', 'tasks:today', 'shell:calendar', 'tasks:review'],
  phoneTab: 'notes:recent',
  captureModuleId: 'notes',
}
const build = (modules: WorkspaceModule[], config: Partial<ShellConfig> = {}) =>
  buildRegistry(modules, { ...CONFIG, ...config })

describe("the rail's pinned pages", () => {
  it('are chosen by the app, not offered into place by a module', () => {
    // The fakes offer a page and are not pinned, so only the shell's own two remain.
    expect(build([notes, files]).pinned.map((p) => p.label)).toEqual(['Workbench', 'Calendar'])
  })
})

describe("the phone's day tab", () => {
  it('is the offered page the app names, pinned or not', () => {
    expect(build([notes, files]).phoneTab).toMatchObject({ key: 'notes:recent', label: 'Recent' })
  })

  it('is absent when the app names a page nobody offers', () => {
    expect(build([notes, files], { phoneTab: 'tasks:today' }).phoneTab).toBeNull()
  })
})

describe('the kinds of thing', () => {
  it('take one entry per module, in their stated order', () => {
    expect(build([notes, files]).kinds.map((k) => [k.moduleId, k.label])).toEqual([
      [null, 'Projects'],
      ['files', 'Files'],
      ['notes', 'Notes'],
    ])
  })
})

describe('routes', () => {
  it('mounts each module under its own namespace', () => {
    expect(build([notes, files]).routes).toEqual([
      { path: '/notes', children: notes.routes },
      { path: '/files', children: files.routes },
    ])
  })
})

describe('the workbench widgets', () => {
  it('collects every module card, in registration order, tagged with its module', () => {
    expect(build([notes, files]).widgets.map((w) => `${w.moduleId}:${w.id}`)).toEqual([
      'notes:recent',
      'files:big',
    ])
  })

  it('lays the cards out in their stated order, not in the order modules registered', () => {
    const first = {
      ...notes,
      widgets: [{ id: 'late', label: 'Late', order: 20, Component: () => null }],
    }
    const second = {
      ...files,
      widgets: [{ id: 'early', label: 'Early', order: 10, Component: () => null }],
    }
    expect(build([first, second]).widgets.map((w) => w.label)).toEqual(['Early', 'Late'])
  })

  it('is empty for a module that contributes none, rather than inventing one', () => {
    const { widgets: _dropped, ...noWidgets } = notes
    expect(build([noWidgets, files]).widgets).toHaveLength(1)
  })
})

describe('the master key table', () => {
  it('merges the shell chords and every module chord into one ordered table', () => {
    const table = build([notes]).chords
    // `n` is declared with a lower order than all but `w`, so it slots in after it.
    expect(table.map((c) => c.key)).toEqual(['w', 'n', 'c', 'p'])
    expect(table.map((c) => c.moduleId)).toEqual([null, 'notes', null, null])
  })

  it('resolves a module chord to the module own path', () => {
    const qc = new QueryClient()
    expect(build([notes]).chordFor('n')?.resolve({ queryClient: qc })).toBe('/notes/recent')
    expect(build([files], { captureModuleId: 'files' }).chordFor('n')).toBeNull()
    // The shell keeps its own key whatever is registered.
    expect(build([notes]).chordFor('p')?.resolve({ queryClient: qc })).toBe('/projects')
  })
})

describe('the capture destination', () => {
  it('is the module NAMED as the default, not the first one that can capture', () => {
    // Both fakes can capture, and `files` is not first.
    const registry = build([notes, files], { captureModuleId: 'files' })
    expect(registry.captureModuleId).toBe('files')
    expect(registry.captures.map((c) => c.moduleId)).toEqual(['notes', 'files'])
  })

  it('refuses to guess when the named module is not registered', () => {
    expect(() => build([notes], { captureModuleId: 'files' })).toThrow(
      'capture module "files" is not registered',
    )
    expect(() => build([], { captureModuleId: 'notes' })).toThrow(/not registered/)
  })
})

describe('search providers', () => {
  it('collects every searchable module, with its own name for itself', () => {
    const providers = build([notes, files]).search
    // `files` contributes no search provider, so it is absent rather than empty.
    expect(providers.map((p) => p.moduleId)).toEqual(['notes'])
    expect(providers.map((p) => p.moduleLabel)).toEqual(['Notes'])
  })
})

describe('what a module hangs on a project page', () => {
  it('collects every module that has rows for a project, in registration order', () => {
    const views = build([notes, files]).projectBlocks
    expect(views.map((v) => v.moduleId)).toEqual(['notes', 'files'])
    expect(views.map((v) => v.moduleLabel)).toEqual(['Notes', 'Files'])
    expect(views[0]!.Component).toBe(NotesOnProject)
  })

  it('collects the banner numbers separately, and skips a module that has none', () => {
    const headlines = build([notes, files]).projectHeadlines
    expect(headlines.map((h) => h.moduleId)).toEqual(['notes'])
    expect(headlines[0]!.Component).toBe(NotesProjectNumbers)
  })

  it('collects the row facts and what a delete takes, in registration order', async () => {
    const registry = build([notes, files])
    expect(registry.projectFacts.map((f) => [f.moduleId, f.Facts])).toEqual([['notes', NotesFacts]])
    const qc = new QueryClient()
    expect(await Promise.all(registry.projectContents.map((c) => c(qc, 'p')))).toEqual([
      '3 notes',
      null,
    ])
  })

  it('takes the row lead from the first module that gives one', () => {
    expect(build([notes, files]).projectLead).toBe(FilesLead)
    expect(build([notes]).projectLead).toBeNull()
  })

  it('contributes nothing when only the capturing module is registered and hangs nothing', () => {
    const bare: WorkspaceModule = { id: 'bare', label: 'Bare', routes: [], capture: notes.capture! }
    const registry = build([bare], { captureModuleId: 'bare' })
    expect(registry.projectBlocks).toEqual([])
    expect(registry.projectHeadlines).toEqual([])
    expect(registry.projectFacts).toEqual([])
    expect(registry.projectContents).toEqual([])
  })
})

describe('the keyboard help', () => {
  it('takes each module’s sections in registration order', () => {
    expect(build([notes, files]).help.map((s) => s.title)).toEqual(['In a note', 'In the drive'])
  })
})

describe('where another module keeps its things', () => {
  it('keeps projects in the shell, and takes a type from a module that does not exist', () => {
    // The project entry survives every module being removed, because a project is the shell's.
    const bare: WorkspaceModule = { id: 'bare', label: 'Bare', routes: [], capture: notes.capture! }
    const shellOnly = build([bare], { captureModuleId: 'bare' })
    expect(shellOnly.relations.map((r) => r.type)).toEqual(['project'])
    expect(shellOnly.relationFor('project')?.to('p1')).toBe('/projects/p1')
    const withNotes = build([
      { ...notes, relations: [{ type: 'reading', kind: 'Note', to: (id) => `/notes/${id}` }] },
    ]).relationFor('reading')
    expect(withNotes?.moduleId).toBe('notes')
    expect(withNotes?.to('r1')).toBe('/notes/r1')
  })

  it('has no answer for a type no module claims', () => {
    expect(build([notes]).relationFor('person')).toBeNull()
  })
})

describe('the registry in React', () => {
  it('refuses to render without a provider, rather than drawing an empty shell', () => {
    function Reader() {
      useRegistry()
      return null
    }
    expect(() => renderToString(<Reader />)).toThrow('useRegistry needs a RegistryProvider')
  })
})
