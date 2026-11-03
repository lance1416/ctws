import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createPerson } from '../../helpers/builders'
import { appWithUser, type Harness } from '../../helpers/harness'

/**
 * Folders and pins: a note on its own may sit in one folder and be pinned; a note hung on a thing
 * goes where the thing is. Neither is an edit.
 */
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup() {
  const ctx = await appWithUser()
  cleanups.push(ctx.stop)
  return ctx
}

const call = (
  ctx: Harness,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: ctx.authed,
    ...(payload ? { payload } : {}),
  })

async function note(ctx: Harness, body: object): Promise<NoteResponse> {
  const res = await call(ctx, 'POST', '/notes', body)
  expect(res.statusCode, res.body).toBe(201)
  return res.json()
}

async function folder(
  ctx: Harness,
  name: string,
  parent: NoteFolderResponse | null = null,
): Promise<NoteFolderResponse> {
  const res = await call(ctx, 'POST', '/notes/folders', { name, parentId: parent?.id ?? null })
  expect(res.statusCode, res.body).toBe(201)
  return res.json()
}

describe('folders', () => {
  it('are listed by name, and a name is a folder’s own', async () => {
    const ctx = await setup()
    await folder(ctx, 'Reading notes')
    const ideas = await folder(ctx, 'Ideas')
    expect((await call(ctx, 'POST', '/notes/folders', { name: 'Ideas' })).statusCode).toBe(409)
    const list = (await call(ctx, 'GET', '/notes/folders')).json() as {
      folders: NoteFolderResponse[]
    }
    expect(list.folders.map((f) => f.name)).toEqual(['Ideas', 'Reading notes'])

    expect(
      (await call(ctx, 'PATCH', `/notes/folders/${ideas.id}`, { name: 'Reading notes' }))
        .statusCode,
    ).toBe(409)
    const renamed = await call(ctx, 'PATCH', `/notes/folders/${ideas.id}`, { name: 'Someday' })
    expect(renamed.statusCode, renamed.body).toBe(200)
    expect((renamed.json() as NoteFolderResponse).name).toBe('Someday')
  })

  it('hold notes on their own; deleted, they leave their notes in none', async () => {
    const ctx = await setup()
    const reading = await folder(ctx, 'Reading notes')
    const n = await note(ctx, { title: 'Shape Up', body: 'Appetite, not estimates.' })
    const moved = await call(ctx, 'PATCH', `/notes/${n.id}`, { folderId: reading.id })
    expect(moved.statusCode, moved.body).toBe(200)
    const kept = moved.json() as NoteResponse
    expect(kept.folderId).toBe(reading.id)
    // Moving it is not writing it: its edited time stays.
    expect(kept.updatedAt).toBe(n.updatedAt)

    expect((await call(ctx, 'DELETE', `/notes/folders/${reading.id}`)).statusCode).toBe(204)
    const after = (await call(ctx, 'GET', `/notes/${n.id}`)).json() as NoteResponse
    expect(after.folderId).toBeNull()
    expect(after.body).toBe('Appetite, not estimates.')
  })

  it('make a note in themselves, from their own New note', async () => {
    const ctx = await setup()
    const reading = await folder(ctx, 'Reading notes')
    const made = await note(ctx, { title: 'Untitled', body: 'x', folderId: reading.id })
    expect(made.folderId).toBe(reading.id)
    const person = await createPerson(ctx, { name: 'Mira Chen' })
    const hung = await call(ctx, 'POST', '/notes', {
      body: 'x',
      folderId: reading.id,
      anchor: { type: 'person', id: person.id },
    })
    expect(hung.statusCode).toBe(409)
  })

  it('are not another workspace’s to file into', async () => {
    const mine = await setup()
    const theirs = await setup()
    const their = await folder(theirs, 'Theirs')
    const n = await note(mine, { body: 'x' })
    expect((await call(mine, 'PATCH', `/notes/${n.id}`, { folderId: their.id })).statusCode).toBe(
      404,
    )
    expect(
      (await call(mine, 'PATCH', `/notes/folders/${their.id}`, { name: 'Mine' })).statusCode,
    ).toBe(404)
    expect((await call(mine, 'DELETE', `/notes/folders/${their.id}`)).statusCode).toBe(404)
  })
})

describe('pins', () => {
  it('pin a note on its own, and unpin it, its edited time kept', async () => {
    const ctx = await setup()
    const n = await note(ctx, { body: 'Weekend plan' })
    const pinned = (
      await call(ctx, 'PATCH', `/notes/${n.id}`, { pinned: true })
    ).json() as NoteResponse
    expect(pinned.pinnedAt).not.toBeNull()
    expect(pinned.updatedAt).toBe(n.updatedAt)
    const unpinned = (
      await call(ctx, 'PATCH', `/notes/${n.id}`, { pinned: false })
    ).json() as NoteResponse
    expect(unpinned.pinnedAt).toBeNull()
  })
})

describe('a note hung on a thing', () => {
  it('takes no folder and no pin', async () => {
    const ctx = await setup()
    const mira = await createPerson(ctx, { name: 'Mira Chen' })
    const reading = await folder(ctx, 'Reading notes')
    const n = await note(ctx, { body: 'Likes ledgers', anchor: { type: 'person', id: mira.id } })
    expect((await call(ctx, 'PATCH', `/notes/${n.id}`, { folderId: reading.id })).statusCode).toBe(
      409,
    )
    expect((await call(ctx, 'PATCH', `/notes/${n.id}`, { pinned: true })).statusCode).toBe(409)
  })

  it('leaves its folder and its pin when it is hung on one', async () => {
    const ctx = await setup()
    const mira = await createPerson(ctx, { name: 'Mira Chen' })
    const reading = await folder(ctx, 'Reading notes')
    const n = await note(ctx, { body: 'x' })
    await call(ctx, 'PATCH', `/notes/${n.id}`, { folderId: reading.id, pinned: true })
    const hung = await call(ctx, 'PATCH', `/notes/${n.id}`, {
      anchor: { type: 'person', id: mira.id },
    })
    expect(hung.statusCode, hung.body).toBe(200)
    const after = hung.json() as NoteResponse
    expect([after.folderId, after.pinnedAt]).toEqual([null, null])
  })
})

describe('folders in folders', () => {
  const list = async (ctx: Harness) =>
    ((await call(ctx, 'GET', '/notes/folders')).json() as { folders: NoteFolderResponse[] }).folders

  it('go three deep, a name its own among those beside it', async () => {
    const ctx = await setup()
    const job = await folder(ctx, 'Job hunt prep')
    const offers = await folder(ctx, 'Offers', job)
    const london = await folder(ctx, 'London', offers)
    expect(london.parentId).toBe(offers.id)
    const fourth = await call(ctx, 'POST', '/notes/folders', {
      name: 'Too far',
      parentId: london.id,
    })
    expect(fourth.statusCode).toBe(409)
    expect(fourth.json().detail).toBe('Folders go three deep')
    // Beside each other two cannot share a name, at the top too; under another they can.
    await folder(ctx, 'Offers')
    expect(
      (await call(ctx, 'POST', '/notes/folders', { name: 'Offers', parentId: job.id })).statusCode,
    ).toBe(409)
    expect((await call(ctx, 'POST', '/notes/folders', { name: 'Job hunt prep' })).statusCode).toBe(
      409,
    )
  })

  it('move with all they hold, never under themselves or past three deep', async () => {
    const ctx = await setup()
    const a = await folder(ctx, 'A')
    const b = await folder(ctx, 'B', a)
    await folder(ctx, 'C', b)
    const d = await folder(ctx, 'D')
    const e = await folder(ctx, 'E', d)
    expect(
      (await call(ctx, 'PATCH', `/notes/folders/${a.id}`, { parentId: b.id })).statusCode,
    ).toBe(409)
    // D holds two levels: it can go under A, not under B.
    expect(
      (await call(ctx, 'PATCH', `/notes/folders/${d.id}`, { parentId: b.id })).statusCode,
    ).toBe(409)
    const moved = await call(ctx, 'PATCH', `/notes/folders/${d.id}`, { parentId: a.id })
    expect(moved.statusCode).toBe(200)
    const now = await list(ctx)
    expect(now.find((f) => f.id === d.id)?.parentId).toBe(a.id)
    expect(now.find((f) => f.id === e.id)?.parentId).toBe(d.id)
    expect(
      (await call(ctx, 'PATCH', `/notes/folders/${d.id}`, { parentId: null })).json().parentId,
    ).toBeNull()
  })

  it('deleted, leave what they hold one level up, a name taken there numbered', async () => {
    const ctx = await setup()
    const talks = await folder(ctx, 'Talks')
    const ideas = await folder(ctx, 'Ideas')
    const inner = await folder(ctx, 'Talks', ideas)
    const same = await folder(ctx, 'Ideas', ideas)
    const n = await note(ctx, { title: 'Kept', body: 'x' })
    await call(ctx, 'PATCH', `/notes/${n.id}`, { folderId: ideas.id })
    expect((await call(ctx, 'DELETE', `/notes/folders/${ideas.id}`)).statusCode).toBe(204)
    const now = await list(ctx)
    expect(now.map((f) => [f.name, f.parentId]).sort()).toEqual(
      [
        ['Ideas', null],
        ['Talks', null],
        ['Talks 2', null],
      ].sort(),
    )
    expect(now.find((f) => f.id === inner.id)?.name).toBe('Talks 2')
    expect(now.find((f) => f.id === same.id)?.name).toBe('Ideas')
    expect(now.find((f) => f.id === talks.id)?.name).toBe('Talks')
    expect(((await call(ctx, 'GET', `/notes/${n.id}`)).json() as NoteResponse).folderId).toBeNull()
  })

  it('open and close as they are left, which is no edit', async () => {
    const ctx = await setup()
    const a = await folder(ctx, 'A')
    expect(a.open).toBe(false)
    const opened = (await call(ctx, 'PATCH', `/notes/folders/${a.id}`, { open: true })).json()
    expect(opened.open).toBe(true)
    expect(opened.updatedAt).toBe(a.updatedAt)
  })
})
