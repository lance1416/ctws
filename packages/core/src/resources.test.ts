import { describe, expect, it } from 'vitest'
import { resourceLook } from './resources'

describe('resourceLook', () => {
  it.each([
    ['https://github.com/ctws/ctws/pull/123', 'github-pr', '#123', 'GitHub'],
    ['https://github.com/ctws/ctws/issues/7', 'github-issue', '#7', 'GitHub'],
    ['https://github.com/ctws/ctws', 'github', 'ctws/ctws', 'GitHub'],
    ['https://docs.google.com/document/d/abc/edit', 'google-doc', 'Google Doc', 'Google Docs'],
    ['https://docs.google.com/spreadsheets/d/abc', 'google-sheet', 'Google Sheet', 'Google Sheets'],
    [
      'https://docs.google.com/presentation/d/abc',
      'google-slides',
      'Google Slides',
      'Google Slides',
    ],
    ['https://drive.google.com/drive/folders/abc', 'google-drive', 'Drive folder', 'Google Drive'],
    ['https://www.overleaf.com/project/abc', 'overleaf', 'Overleaf project', 'Overleaf'],
    ['https://www.figma.com/design/abc/Board', 'figma', 'Figma file', 'Figma'],
    ['https://martinfowler.com/articles/x.html', 'web', 'martinfowler.com', 'martinfowler.com'],
  ])('%s', (url, service, label, source) => {
    expect(resourceLook(url)).toEqual({ service, label, source })
  })

  it('reads only the address: a GitHub path that is not a PR or issue is the repository', () => {
    expect(resourceLook('https://github.com/ctws/ctws/actions').service).toBe('github')
  })

  it('treats something that is not an address as plain web with the text as its label', () => {
    expect(resourceLook('not a url')).toEqual({ service: 'web', label: 'not a url', source: '' })
  })
})
