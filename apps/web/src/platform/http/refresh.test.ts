import {
  MutationObserver,
  QueryClient,
  QueryObserver,
  type MutationMeta,
} from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { refreshAfterWrites } from './refresh'
import { clearWriteFailure, writeFailure } from './writeFailure'

function client() {
  const qc: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
    mutationCache: refreshAfterWrites(() => qc),
  })
  return qc
}

const write = (qc: QueryClient, meta: MutationMeta = {}) =>
  new MutationObserver(qc, { mutationFn: async () => 'ok', meta }).mutate()

describe('refreshing after a write', () => {
  it('refetches every watched query after a write', async () => {
    const qc = client()
    const a = vi.fn(async () => 1)
    const b = vi.fn(async () => 2)
    const stopA = new QueryObserver(qc, { queryKey: ['tasks', 'today'], queryFn: a }).subscribe(
      () => {},
    )
    const stopB = new QueryObserver(qc, { queryKey: ['people', 'list'], queryFn: b }).subscribe(
      () => {},
    )
    await vi.waitFor(() => expect(a).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(b).toHaveBeenCalledTimes(1))
    await write(qc)
    await vi.waitFor(() => expect(a).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(b).toHaveBeenCalledTimes(2))
    stopA()
    stopB()
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
    await expect(write(qc, { awaits: [['tasks', 'list']] })).resolves.toBe('ok')
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
    const observer = new QueryObserver(qc, { queryKey: ['reading', 'list'], queryFn: fn })
    const stop = observer.subscribe(() => {})
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))
    await write(qc, { awaits: [['reading']] })
    release()
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe('after'))
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
      meta: { awaits: [['projects']] },
      onSuccess: () => {
        seen = qc.getQueryData(['projects'])
      },
    }).mutate()
    expect(seen).toBe(2)
    stop()
  })

  it('refetches after a failed write as well', async () => {
    const qc = client()
    const fn = vi.fn(async () => 1)
    const stop = new QueryObserver(qc, { queryKey: ['tasks', 'list', 'p'], queryFn: fn }).subscribe(
      () => {},
    )
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))
    const failing = new MutationObserver(qc, {
      mutationFn: async () => {
        throw new Error('second request failed')
      },
    })
    await failing.mutate().catch(() => {})
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(2))
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
      meta: { awaits: [['tasks']] },
    })
      .mutate()
      .catch(() => {})
    expect(qc.getQueryData(['tasks', 'list', 'p'])).toBe(2)
    stop()
  })

  it('waits for the last of overlapping writes, so its answer does not undo the others', async () => {
    const qc = client()
    const read = vi.fn(async () => 1)
    const stop = new QueryObserver(qc, { queryKey: ['tasks', 'list'], queryFn: read }).subscribe(
      () => {},
    )
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    let finish!: (v: string) => void
    const second = new MutationObserver(qc, {
      mutationFn: () => new Promise<string>((done) => (finish = done)),
    }).mutate()

    await write(qc)
    // The second write's optimistic rows are still on screen; a refetch now would put them back.
    expect(read).toHaveBeenCalledTimes(1)
    finish('ok')
    await second
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    stop()
  })

  it('leaves the cache alone for a write that opts out', async () => {
    const qc = client()
    const fn = vi.fn(async () => 1)
    const stop = new QueryObserver(qc, { queryKey: ['me'], queryFn: fn }).subscribe(() => {})
    await vi.waitFor(() => expect(fn).toHaveBeenCalledTimes(1))
    await write(qc, { refresh: false })
    await new Promise((r) => setTimeout(r, 20))
    expect(fn).toHaveBeenCalledTimes(1)
    stop()
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
