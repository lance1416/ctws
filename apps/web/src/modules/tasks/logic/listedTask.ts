import type { LinkCandidate } from '@ctws/contracts'

/** A task's line under its title where things of every kind are listed: its project, and Done. */
export const describeTask = (t: LinkCandidate): string | null =>
  t.type !== 'task' ? null : t.status === 'done' ? `${t.projectName} · Done` : t.projectName
