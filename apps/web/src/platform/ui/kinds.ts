import type { Kind } from './icons'

/** The text colour of a kind's icon or word, a lookup so Tailwind sees every class (FR-002). */
export const KIND_TEXT: Record<Kind, string> = {
  task: 'text-task',
  meeting: 'text-meeting',
  person: 'text-person',
  reading: 'text-reading',
  project: 'text-project',
  organisation: 'text-organisation',
  communication: 'text-communication',
  note: 'text-note',
}

/** The tint behind a kind's badge or chip. */
export const KIND_TINT: Record<Kind, string> = {
  task: 'bg-task-bg',
  meeting: 'bg-meeting-bg',
  person: 'bg-person-bg',
  reading: 'bg-reading-bg',
  project: 'bg-project-bg',
  organisation: 'bg-organisation-bg',
  communication: 'bg-communication-bg',
  note: 'bg-note-bg',
}
