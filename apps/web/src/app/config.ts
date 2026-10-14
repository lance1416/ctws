import type { ShellConfig } from '../shell/registry'

export const SHELL_CONFIG: ShellConfig = {
  // Organised by time and routine, never by kind; a new kind gets a row in Things instead.
  pinned: ['shell:workbench', 'tasks:today', 'shell:calendar', 'tasks:review'],
  captureModuleId: 'tasks',
}
