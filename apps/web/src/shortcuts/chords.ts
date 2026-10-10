/**
 * The mechanics of the `g`-prefixed jump chords, borrowed from OpenProject (D46/B6). A chord
 * rather than a bare key because the destinations would otherwise eat a single letter each, and
 * `g` reads as "go".
 *
 * The TABLE itself is not here: the shell and each module contribute their own chords and the
 * registry merges them into one keyspace (module-boundary contract §3 -- the master key table is a
 * shell surface). This file keeps only what is true of every chord.
 */

/** The chord prefix. */
export const JUMP_PREFIX = 'g'

/** How long a pending `g` waits for its second key before it is forgotten. */
export const CHORD_TIMEOUT_MS = 1500
