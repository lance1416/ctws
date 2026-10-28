import type { WorkspaceModule } from '../shell/contract'
import { meetingModule } from '../modules/meetings'
import { communicationModule } from '../modules/communication'
import { notesModule } from '../modules/notes'
import { organisationModule } from '../modules/organisations'
import { peopleModule } from '../modules/people'
import { readingModule } from '../modules/reading'
import { taskModule } from '../modules/tasks'

/** Frozen: the shell calls one hook per contribution, so the list never changes at runtime. */
export const MODULES: readonly WorkspaceModule[] = Object.freeze([
  taskModule,
  readingModule,
  peopleModule,
  organisationModule,
  meetingModule,
  communicationModule,
  notesModule,
])
