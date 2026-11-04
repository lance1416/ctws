/** What modules may use of files: keeping a holder's photo, and letting files go with a delete. */
export { bytesOf, PHOTO_BODY, storeOf } from './routes'
export { keepPhoto, letGo, putBackPhoto, takeOffPhoto, type Holder } from './service'
export { fileKeys } from './tables'

// For the app, which mounts the routes and runs the sweep.
export { acceptFileBodies, photoRoutes } from './routes'
export { sweepFiles } from './service'
