import { useInspector } from '../layout/inspectorAddress'

/** Closing the inspector, for a narrow page with a close of its own (a task's, artboard 8). */
export const useCloseInspector = () => useInspector().close
