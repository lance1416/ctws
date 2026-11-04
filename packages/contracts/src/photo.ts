import { z } from 'zod'
import { fileId, undoToken } from './id'

/** The largest photo taken, before it is cut and scaled. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024

/**
 * Where a photo is cut: a square on the picture as it is seen upright (turned by its EXIF
 * orientation, as a browser shows it), in that picture's own pixels. The body is the file itself.
 * Only numbers here: whether the square fits is known once the picture is read, and a square that
 * does not is refused then, as `bad-crop`.
 */
export const photoCrop = z
  .object({ x: z.coerce.number(), y: z.coerce.number(), size: z.coerce.number() })
  .strict()

export const avatarParams = z.object({ avatarId: fileId }).strict()
export const fileParams = z.object({ fileId }).strict()

export const photoResponse = z.object({
  /** Read at `/avatars/:id`; a new photo has a new id, so a cached one is never stale. */
  avatarId: fileId,
})

/** A photo taken off: put it back with this while the Undo lasts. */
export const photoRemovedResponse = z.object({ undoToken })

export const restorePhotoBody = z.object({ undoToken }).strict()
