/** The tasks module's namespace: `/tasks/…` in the app, `/api/v1/tasks/…` on the server. */
export const TASKS_ID = 'tasks'

/** A page of this module: `/tasks/<page>`. */
export const taskPage = (page: string) => `/${TASKS_ID}/${page}`
