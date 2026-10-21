/**
 * What is true of every `g` chord. The table itself is the registry's, merged from the shell's
 * chords and each module's into one keyspace.
 */

export const JUMP_PREFIX = 'g'
/** The prefix that makes something: `n` then the creator's key (FR-026). */
export const NEW_PREFIX = 'n'

/** How long a pending `g` waits for its second key before it is forgotten. */
export const CHORD_TIMEOUT_MS = 1500
