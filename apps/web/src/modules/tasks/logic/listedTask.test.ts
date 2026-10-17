import { describe, expect, it } from 'vitest'
import { describeTask } from './listedTask'

const task = (status: 'todo' | 'done') =>
  ({ type: 'task', id: 't1', title: '改简历', status, projectName: '找工作' }) as const

describe('describeTask', () => {
  it('names the project, so two tasks of one name can be told apart', () => {
    expect(describeTask(task('todo'))).toBe('找工作')
  })

  it('says a finished one is done beside its project, rather than instead of it', () => {
    expect(describeTask(task('done'))).toBe('找工作 · Done')
  })
})
