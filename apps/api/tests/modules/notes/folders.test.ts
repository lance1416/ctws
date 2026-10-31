import type { NoteFolderResponse, NoteResponse } from '@ctws/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { createPerson } from '../../helpers/builders'
import { appWithUser, type Harness } from '../../helpers/harness'

/**
 * FOLDERS AND PINS (REQ-002 FR-110): a note on its own may sit in one folder and be pinned; a note
 * hung on a thing goes where the thing is. Neither is an edit.
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

async function folder(ctx: Harness, name: string): Promise<NoteFolderResponse> {
  const res = await call(ctx, 'POST', '/notes/folders', { name })
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
