import { describe, expect, it } from 'vitest'
import { headingsOf } from './headings'

describe('headingsOf', () => {
  it('lists a note’s headings for its block’s little contents (FR-069)', () => {
    const body = '## Updates\n- one\n\n## Decisions\ntext\n### Risks ##\n#not a heading\n## Actions'
    expect(headingsOf(body)).toEqual(['Updates', 'Decisions', 'Risks', 'Actions'])
  })

  it('stops at six, so the head keeps its room', () => {
    const body = Array.from({ length: 8 }, (_, i) => `## Part ${i + 1}`).join('\n')
    expect(headingsOf(body)).toHaveLength(6)
  })
})
