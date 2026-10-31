import type { ObjectType } from '@ctws/contracts'
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  type MutationMeta,
  type QueryKey,
} from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { refreshAfterWrites, type StaleFor } from './refresh'
import { clearWriteFailure, writeFailure } from './writeFailure'

/** A small app's table: which key prefixes read which kinds of thing. `me` reads none. */
const READS: { queryKey: QueryKey; of: ObjectType[] }[] = [
  { queryKey: ['tasks'], of: ['task', 'project'] },
  { queryKey: ['people'], of: ['person', 'project'] },
  { queryKey: ['projects'], of: ['project', 'task'] },
  { queryKey: ['links'], of: ['task', 'person', 'project', 'reading', 'meeting'] },
]
const staleFor: StaleFor = (changes) =>
  READS.filter((r) => r.of.some((t) => changes.includes(t))).map((r) => r.queryKey)

function client() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    mutationCache: refreshAfterWrites(() => qc, staleFor),
  })
  return qc
}

const write = (qc: QueryClient, meta: MutationMeta = {}) =>
  new MutationObserver(qc, { mutationFn: async () => 'ok', meta }).mutate()

/** Watches `queryKey`, counting its reads. */
function watch(qc: QueryClient, queryKey: QueryKey) {
  const read = vi.fn(async () => 1)
  const stop = new QueryObserver(qc, { queryKey, queryFn: read }).subscribe(() => {})
  return { read, stop }
}

/** Lets every refetch a write started run to the end. */
const settle = () => new Promise((r) => setTimeout(r, 20))

describe('refreshing after a write', () => {
  it('refetches the watched queries that read what the write changed, and no others', async () => {
    const qc = client()
    const people = watch(qc, ['people', 'list'])
    const links = watch(qc, ['links', 'person', 'p1'])
    const projects = watch(qc, ['projects'])
    const me = watch(qc, ['me'])
    await vi.waitFor(() => expect(me.read).toHaveBeenCalledTimes(1))
    await write(qc, { changes: ['person'] })
    await settle()
    expect(people.read).toHaveBeenCalledTimes(2)
    expect(links.read).toHaveBeenCalledTimes(2)
    expect(projects.read).toHaveBeenCalledTimes(1)
    expect(me.read).toHaveBeenCalledTimes(1)
    for (const w of [people, links, projects, me]) w.stop()
  })

  it('refetches every watched query after a write that does not say what it changed', async () => {
    const qc = client()
    const tasks = watch(qc, ['tasks', 'today'])
    const me = watch(qc, ['me'])
    await vi.waitFor(() => expect(me.read).toHaveBeenCalledTimes(1))
    await write(qc)
    await vi.waitFor(() => expect(tasks.read).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(me.read).toHaveBeenCalledTimes(2))
    tasks.stop()
    me.stop()
  })

  it('waits only for the queries the write names', async () => {
    const qc = client()
    let calls = 0
    const stop = new QueryObserver(qc, {
      queryKey: ['tasks', 'movement'],
      queryFn: () => (++calls === 1 ? Promise.resolve(0) : new Promise<number>(() => {})),
    }).subscribe(() => {})
    await vi.waitFor(() => expect(calls).toBe(1))
    // Resolves although the movement refetch never lands: only `['tasks', 'list']` is awaited.
    await expect(write(qc, { changes: ['task'], awaits: [['tasks', 'list']] })).resolves.toBe('ok')
    expect(calls).toBe(2)
    stop()
  })

  it('restarts a first read that was in flight when the write landed', async () => {
    const qc = client()
    const answers = ['before', 'after']
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const fn = vi.fn(async () => {
      const answer = answers.shift()!
      if (answer === 'before') await held
      return answer
    })
    const observer = new QueryObserver(qc, { queryKey: ['people', 'list'], queryFn: fn })
    const stop = observer.subscribe(() => {})
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))
    await write(qc, { changes: ['person'], awaits: [['people']] })
    release()
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('after'))
    stop()
  })

  it('leaves a read of something else in flight', async () => {
    const qc = client()
    let release!: (v: number) => void
    const fn = vi.fn(() => new Promise<number>((r) => (release = r)))
    const observer = new QueryObserver(qc, { queryKey: ['me'], queryFn: fn })
    const stop = observer.subscribe(() => {})
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))
    await write(qc, { changes: ['task'] })
    release(1)
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe(1))
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
  })

  it("has the named queries fresh by the time the write's own onSuccess runs", async () => {
    const qc = client()
    let value = 1
    const stop = new QueryObserver(qc, {
      queryKey: ['projects'],
      queryFn: async () => value,
    }).subscribe(() => {})
    await vi.waitFor(() => expect(qc.getQueryData(['projects'])).toBe(1))
    let seen: unknown
    await new MutationObserver(qc, {
      mutationFn: async () => {
        value = 2
      },
      meta: { changes: ['project'], awaits: [['projects']] },
      onSuccess: () => {
        seen = qc.getQueryData(['projects'])
      },
    }).mutate()
    expect(seen).toBe(2)
    stop()
  })

  it("refetches after a failed write's rollback, so the server's state wins", async () => {
    const qc = client()
    let value = 1
    const stop = new QueryObserver(qc, {
      queryKey: ['tasks', 'list', 'p'],
      queryFn: async () => value,
    }).subscribe(() => {})
    await vi.waitFor(() => expect(qc.getQueryData(['tasks', 'list', 'p'])).toBe(1))
    await new MutationObserver(qc, {
      onMutate: () => {
        qc.setQueryData(['tasks', 'list', 'p'], 99)
        return { before: 1 }
      },
      // The first of two requests landed, then the second failed.
      mutationFn: async () => {
        value = 2
        throw new Error('second request failed')
      },
      onError: (_e, _v, ctx) => qc.setQueryData(['tasks', 'list', 'p'], ctx!.before),
      meta: { changes: ['task'], awaits: [['tasks']] },
    })
      .mutate()
      .catch(() => {})
    expect(qc.getQueryData(['tasks', 'list', 'p'])).toBe(2)
    stop()
  })

  it('refreshes once for overlapping writes, after the last, what each of them changed', async () => {
    const qc = client()
    const tasks = watch(qc, ['tasks', 'list'])
    const people = watch(qc, ['people', 'list'])
    await vi.waitFor(() => expect(people.read).toHaveBeenCalledTimes(1))
    let finish!: (v: string) => void
    const second = new MutationObserver(qc, {
      mutationFn: () => new Promise<string>((done) => (finish = done)),
      meta: { changes: ['person'] },
    }).mutate()

    await write(qc, { changes: ['task'] })
    // The second write's optimistic rows are still on screen; a refetch now would put them back.
    expect(tasks.read).toHaveBeenCalledTimes(1)
    finish('ok')
    await second
    await vi.waitFor(() => expect(tasks.read).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(people.read).toHaveBeenCalledTimes(2))
    tasks.stop()
    people.stop()
  })

  it('does not ask again for what a write removed, still watched or not', async () => {
    const qc = client()
    const list = watch(qc, ['tasks', 'list', 'p1'])
    const gone = watch(qc, ['tasks', 'one', 't1'])
    const itsLinks = watch(qc, ['tasks', 'dependencies', 't1'])
    await vi.waitFor(() => expect(itsLinks.read).toHaveBeenCalledTimes(1))
    await write(qc, {
      changes: ['task'],
      gone: [
        ['tasks', 'one', 't1'],
        ['tasks', 'dependencies', 't1'],
      ],
    })
    await settle()
    expect(list.read).toHaveBeenCalledTimes(2)
    expect(gone.read).toHaveBeenCalledTimes(1)
    expect(itsLinks.read).toHaveBeenCalledTimes(1)
    for (const w of [list, gone, itsLinks]) w.stop()
  })

  it('asks again for what a failed write meant to remove', async () => {
    const qc = client()
    const one = watch(qc, ['tasks', 'one', 't1'])
    await vi.waitFor(() => expect(one.read).toHaveBeenCalledTimes(1))
    const failing = new MutationObserver(qc, {
      mutationFn: async () => {
        throw new Error('refused')
      },
      meta: { changes: ['task'], gone: [['tasks', 'one', 't1']] },
    })
    await failing.mutate().catch(() => undefined)
    await settle()
    expect(one.read).toHaveBeenCalledTimes(2)
    one.stop()
  })

  it('leaves the cache alone for a write that opts out', async () => {
    const qc = client()
    const me = watch(qc, ['me'])
    await vi.waitFor(() => expect(me.read).toHaveBeenCalledTimes(1))
    await write(qc, { refresh: false })
    await settle()
    expect(me.read).toHaveBeenCalledTimes(1)
    me.stop()
  })
})

describe('a failed write nobody says', () => {
  const failing = (qc: QueryClient, meta: MutationMeta = {}) =>
    new MutationObserver(qc, {
      mutationFn: async () => {
        throw new ApiError(422, 'Unprocessable', 'That name is taken')
      },
      meta,
    })
      .mutate()
      .catch(() => {})

  it("is reported in the server's words", async () => {
    clearWriteFailure()
    await failing(client())
    expect(writeFailure()?.text).toBe('That name is taken')
  })

  it('is not reported when the write says it itself', async () => {
    clearWriteFailure()
    await failing(client(), { ownsError: true })
    expect(writeFailure()).toBeNull()
  })

  it('is cleared when the next write starts', async () => {
    const qc = client()
    await failing(qc)
    expect(writeFailure()).not.toBeNull()
    await write(qc)
    expect(writeFailure()).toBeNull()
  })
})
