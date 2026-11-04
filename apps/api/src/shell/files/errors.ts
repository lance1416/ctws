import { DomainError } from '../../platform/errors'

/** What came is not one of the four kinds of picture, whatever it is called. */
export class UnsupportedImageError extends DomainError {
  constructor() {
    super('invalid', {
      type: 'urn:ctws:problem:unsupported-image',
      title: "That file isn't a JPEG, PNG, WebP or GIF image.",
    })
  }
}

/** The square to cut does not lie inside the upright picture. */
export class BadCropError extends DomainError {
  constructor() {
    super('invalid', {
      type: 'urn:ctws:problem:bad-crop',
      title: 'The square to cut must lie inside the picture.',
    })
  }
}

/** The server has nowhere to keep files; the page disables photos before this can be met. */
export class PhotosOffError extends DomainError {
  constructor() {
    super('unavailable', {
      type: 'urn:ctws:problem:photos-off',
      title: "Photos need file storage, which this server doesn't have set up.",
    })
  }
}

/** The minute to put a photo back is over, or another photo has taken its place since. */
export class UndoExpiredError extends DomainError {
  constructor() {
    super('conflict', {
      type: 'urn:ctws:problem:undo-expired',
      title: 'That can no longer be undone.',
    })
  }
}
