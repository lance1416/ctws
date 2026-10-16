import { describe, expect, it } from 'vitest'
import { idFrom, objectId, projectId, taskId } from './id'

const UPPER = '0190A1B2-C3D4-7E5F-8A6B-7C8D9E0F1A2B'

describe('ids', () => {
  it('reads an id in lower case, whichever case it came in', () => {
    expect(taskId.parse(UPPER)).toBe(UPPER.toLowerCase())
    expect(objectId.parse(UPPER)).toBe(UPPER.toLowerCase())
    expect(idFrom(projectId, UPPER)).toBe(UPPER.toLowerCase())
  })

  it('refuses a value that is not a uuid', () => {
    expect(taskId.safeParse('not-an-id').success).toBe(false)
    expect(taskId.safeParse('').success).toBe(false)
  })

  it('keeps one kind of id from standing in for another', () => {
    const task = taskId.parse(UPPER)
    // @ts-expect-error a task's id is not a project's
    const project: ReturnType<typeof projectId.parse> = task
    expect(project).toBe(task)
  })
})
