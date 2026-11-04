import { api, PHOTO_MAX_BYTES, type FileId, type UserId } from '@ctws/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { NotFound } from '../../platform/errors'
import { on, serve } from '../../platform/http/serve'
import type { ObjectStore } from '../../platform/storage'
import { actorOf, currentUser } from '../auth'
import { users } from '../auth/tables'
import { PhotosOffError, UnsupportedImageError } from './errors'
import { keepPhoto, keyOf, putBackPhoto, takeOffPhoto, type Holder } from './service'

/** The store, or the refusal a server without one gives. */
export function storeOf(app: FastifyInstance): ObjectStore {
  if (!app.storage) throw new PhotosOffError()
  return app.storage
}

/** A photo's route takes the file itself as its body, at the size a photo may be. */
export const PHOTO_BODY = { bodyLimit: PHOTO_MAX_BYTES }

/**
 * Lets a photo be sent as it is: `application/octet-stream`, or the file's own image type, which
 * is what a browser sends a `File` as. What the bytes are is decided from the bytes.
 */
export function acceptFileBodies(app: FastifyInstance): void {
  for (const type of ['application/octet-stream', /^image\//]) {
    app.addContentTypeParser(type, { parseAs: 'buffer' }, (_req, body, done) => done(null, body))
  }
}

/** The body a photo route parsed: bytes, or nothing a picture could be made from. */
export function bytesOf(body: unknown): Buffer {
  if (!Buffer.isBuffer(body)) throw new UnsupportedImageError()
  return body
}

/** The signed-in account, as the holder of its own photo. */
const accountHolder = (userId: UserId): Holder => ({
  id: userId,
  async swap(tx, next) {
    const [row] = await tx
      .select({ avatarId: users.avatarId })
      .from(users)
      .where(eq(users.id, userId))
      .for('update')
    await tx.update(users).set({ avatarId: next }).where(eq(users.id, userId))
    return row?.avatarId ?? null
  },
  async refill(tx, photo: FileId) {
    const done = await tx
      .update(users)
      .set({ avatarId: photo })
      .where(and(eq(users.id, userId), isNull(users.avatarId)))
      .returning({ id: users.id })
    return done.length > 0
  },
})

/**
 * Photos read back, and the account's own set, taken off and put back. A photo is read only by
 * its own workspace: any other gets the same 404 as an id that never was, so ids cannot be probed.
 */
export const photoRoutes: FastifyPluginAsyncZod = async (app) => {
  serve(app, [
    on(api.photos.get, async (req, reply) => {
      const store = storeOf(app)
      const key = await keyOf(app.db, currentUser(req).workspaceId, req.params.avatarId)
      const file = key ? await store.get(key) : null
      if (!file) throw new NotFound('Photo')
      // A photo never changes under its id, so it is kept for good; `private`: it is behind a
      // session, and no shared cache may hand it to anyone else.
      reply
        .header('cache-control', 'private, max-age=31536000, immutable')
        .header('x-content-type-options', 'nosniff')
        .type('image/webp')
        .send(file.body)
    }),

    on(
      api.photos.setMine,
      async (req) => {
        const store = storeOf(app)
        const user = currentUser(req)
        const avatarId = await keepPhoto(
          app.db,
          store,
          actorOf(req),
          accountHolder(user.id),
          bytesOf(req.body),
          req.query,
        )
        return { avatarId }
      },
      PHOTO_BODY,
    ),

    on(api.photos.removeMine, async (req) => {
      storeOf(app)
      const token = await takeOffPhoto(app.db, actorOf(req), accountHolder(currentUser(req).id))
      if (!token) throw new NotFound('Photo')
      return { undoToken: token }
    }),

    on(api.photos.restoreMine, async (req) => {
      storeOf(app)
      const holder = accountHolder(currentUser(req).id)
      const avatarId = await putBackPhoto(app.db, actorOf(req), holder, req.body.undoToken)
      return { avatarId }
    }),
  ])
}
