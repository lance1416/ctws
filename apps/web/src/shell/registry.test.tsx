import { idFrom, projectId } from '@ctws/contracts'
import { QueryClient } from '@tanstack/react-query'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { singleKeysOf } from '../platform/keyboard/keyTable'
import type { WorkspaceModule } from './contract'
import { buildRegistry, useRegistry, type ShellConfig } from './registry'

/** Fake notes and files modules: one real module could not show that a second is picked up. */
const NotesOnProject = () => null
const NotesTileFacts = () => null
const FilesCard = { Moved: () => null, Facts: () => null, useOrder: () => () => 0 }
const FilesOutline = () => null

const notes: WorkspaceModule = {
  id: 'notes',
  label: 'Notes',
  // Offered, never pinned: only the app's config decides what is at the top of the rail.
  pages: [{ id: 'recent', to: '/notes/recent', label: 'Recent' }],
  kind: { label: 'Notes', to: '/notes/all', order: 25 },
  routes: [{ path: 'recent' }, { path: 'all' }],
  capture: { kind: 'task', useTarget: () => ({ target: null }) },
  search: { useHits: () => ({ hits: [], isError: false, isSuccess: true }) },
  chords: [
    { id: 'recent', key: 'q', label: 'Go to Recent', resolve: () => '/notes/recent', order: 5 },
  ],
  widgets: [
    { id: 'recent', label: 'Recent notes', to: '/notes/recent', Component: () => null, span: 6 },
  ],
  project: {
    Main: { Component: NotesOnProject, views: [{ id: 'all', label: 'All' }] },
    TileFacts: NotesTileFacts,
    contents: async () => '3 notes',
  },
  keys: [{ title: 'In a note', rows: [{ keys: 'e', does: 'Edit', presses: { e: 'edit' } }] }],
  reads: [{ queryKey: ['notes'], of: ['reading', 'project'] }],
}

const files: WorkspaceModule = {
  id: 'files',
  label: 'Files',
  kind: { label: 'Files', to: '/files/drive', order: 5 },
  routes: [{ path: 'drive' }],
  capture: {
    kind: 'reading',
    useTarget: () => ({ target: null, missing: 'No drive to file into' }),
  },
  widgets: [{ id: 'big', label: 'Bulky', Component: () => null, span: 8 }],
  project: {
    Main: { Component: () => null, views: [{ id: 'all', label: 'All' }] },
    Card: FilesCard,
    Outline: FilesOutline,
    count: () => 4,
    counts: ['task'],
    contents: async () => null,
  },
  reads: [{ queryKey: ['files'], of: ['task'] }],
  keys: [
    {
      title: 'In the drive',
      rows: [
        { keys: 'u', does: 'Upload', presses: { u: 'upload' } },
        { keys: 'e', does: 'Edit', presses: { e: 'edit' } },
        { keys: 'Enter', does: 'Open', presses: { Enter: 'open' } },
      ],
    },
  ],
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

  it('refuses to guess when the app names a page nobody offers', () => {
    expect(() => build([notes, files], { phoneTab: 'tasks:today' })).toThrow(
      'phone tab "tasks:today" is not offered',
    )
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
      widgets: [{ id: 'late', label: 'Late', order: 20, Component: () => null, span: 6 as const }],
    }
    const second = {
      ...files,
      widgets: [
        { id: 'early', label: 'Early', order: 10, Component: () => null, span: 6 as const },
      ],
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
    // `q` is declared with a lower order than all but `w`, so it slots in after it.
    expect(table.map((c) => c.key)).toEqual(['w', 'q', 'c', 'p', 'x', 'n'])
  })

  it('resolves a module chord to the module own path', () => {
    const qc = new QueryClient()
    expect(build([notes]).chordFor('q')?.resolve({ queryClient: qc })).toBe('/notes/recent')
    expect(
      build([files], { captureModuleId: 'files', phoneTab: 'shell:calendar' }).chordFor('q'),
    ).toBeNull()
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
  it('takes the rows the page is about from the first module that gives them', () => {
    const main = build([notes, files]).projectMain
    expect(main?.moduleId).toBe('notes')
    expect(main?.moduleLabel).toBe('Notes')
    expect(main?.Component).toBe(NotesOnProject)
    expect(build([files, notes]).projectMain?.moduleId).toBe('files')
  })

  it('collects the card facts and what a delete takes, in registration order', async () => {
    const registry = build([notes, files])
    expect(registry.projectTileFacts.map((f) => [f.moduleId, f.Facts])).toEqual([
      ['notes', NotesTileFacts],
    ])
    const qc = new QueryClient()
    expect(
      await Promise.all(registry.projectContents.map((c) => c(qc, idFrom(projectId, 'p')))),
    ).toEqual(['3 notes', null])
  })

  it("takes the overview's card from the first module that gives one", () => {
    expect(build([notes, files]).projectCard).toBe(FilesCard)
    expect(build([notes]).projectCard).toBeNull()
  })

  it('takes the sidebar outline from the first module that gives one, and none without', () => {
    expect(build([notes, files]).projectOutline).toBe(FilesOutline)
    expect(build([notes]).projectOutline).toBeNull()
  })

  it("takes the rail's count from the first module that gives one", () => {
    expect(build([notes, files]).projectCount).toBe(files.project!.count)
    expect(build([notes]).projectCount).toBeNull()
  })

  it('contributes nothing when only the capturing module is registered and hangs nothing', () => {
    const bare: WorkspaceModule = {
      id: 'bare',
      label: 'Bare',
      routes: [],
      capture: notes.capture!,
      reads: [],
    }
    const registry = build([bare], { captureModuleId: 'bare', phoneTab: 'shell:calendar' })
    expect(registry.projectMain).toBeNull()
    expect(registry.projectTileFacts).toEqual([])
    expect(registry.projectContents).toEqual([])
  })
})

describe('the keyboard help', () => {
  it('takes each module’s sections in registration order', () => {
    expect(build([notes, files]).keys.map((s) => s.title)).toEqual(['In a note', 'In the drive'])
  })

  it('names every module’s single keys once, in registration order, and only those', () => {
    expect(singleKeysOf(build([notes, files]).keys)).toEqual(['e', 'u'])
  })
})

describe('where another module keeps its things', () => {
  it('keeps projects in the shell, and takes a type from a module that does not exist', () => {
    // The project entry survives every module being removed, because a project is the shell's.
    const bare: WorkspaceModule = {
      id: 'bare',
      label: 'Bare',
      routes: [],
      capture: notes.capture!,
      reads: [],
    }
    const shellOnly = build([bare], { captureModuleId: 'bare', phoneTab: 'shell:calendar' })
    expect(shellOnly.relations.map((r) => r.type)).toEqual(['project', 'communication', 'note'])
    expect(shellOnly.relationFor('project').to('p1')).toBe('/projects/p1')
    const withNotes = build([
      {
        ...notes,
        relations: [{ type: 'reading', kind: 'Note', plural: 'Notes', to: (id) => `/notes/${id}` }],
      },
    ]).relationFor('reading')
    expect(withNotes.moduleId).toBe('notes')
    expect(withNotes.to('r1')).toBe('/notes/r1')
  })

  it('refuses to guess for a type no module claims', () => {
    expect(() => build([notes]).relationFor('person')).toThrow(
      'no module says where a person lives',
    )
  })
})

describe('what a write leaves stale', () => {
  const staleFor = build([notes, files]).staleFor

  it("is every module's queries that read the kind of thing it changed", () => {
    expect(staleFor(['reading'])).toEqual([['links'], ['timeline'], ['notes']])
  })

  it("takes in the project list when a module counts that kind into a project's columns", () => {
    expect(staleFor(['task'])).toEqual([['links'], ['timeline'], ['projects'], ['files']])
  })

  it('reaches whatever names a project when a project changes', () => {
    expect(staleFor(['project'])).toEqual([['links'], ['timeline'], ['projects'], ['notes']])
  })

  it('is the links and timelines alone for a kind no module reads', () => {
    // Any write may add a line to some thing's timeline, as it may change an edge's far end.
    expect(staleFor(['person'])).toEqual([['links'], ['timeline']])
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
