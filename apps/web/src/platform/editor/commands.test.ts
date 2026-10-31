import { EditorSelection, EditorState, type Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { toggleLineMark } from './commands'

/** The text after a command, the cursor at `‸`. */
function run(text: string, mark: string): string {
  const at = text.indexOf('‸')
  let state = EditorState.create({
    doc: text.replace('‸', ''),
    selection: EditorSelection.cursor(at),
  })
  toggleLineMark(mark)({ state, dispatch: (tr: Transaction) => (state = tr.state) })
  return state.doc.toString()
}

describe('the phone’s line buttons', () => {
  it('make the line a heading, a list item or a task, and take the mark off again', () => {
    expect(run('Plan‸', '## ')).toBe('## Plan')
    expect(run('## Pl‸an', '## ')).toBe('Plan')
    expect(run('Call‸', '- [ ] ')).toBe('- [ ] Call')
  })

  it('replace the mark a line had', () => {
    expect(run('- Ca‸ll', '- [ ] ')).toBe('- [ ] Call')
    expect(run('- [x] Ca‸ll', '- ')).toBe('- Call')
    expect(run('### Ca‸ll', '- ')).toBe('- Call')
  })
})
