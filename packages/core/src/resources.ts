/**
 * What a resource's address says about itself (FR-046), read from the address alone: no request
 * is made. A recognised site gets its own icon and a short label; a GitHub pull request or issue
 * is shown as its number.
 */
const RESOURCE_SERVICES = [
  'github-pr',
  'github-issue',
  'github',
  'google-doc',
  'google-sheet',
  'google-slides',
  'google-drive',
  'overleaf',
  'figma',
  'web',
] as const
type ResourceService = (typeof RESOURCE_SERVICES)[number]

type ResourceLook = {
  service: ResourceService
  /** What to call it when it has no name of its own: "#123", "Google Doc", "martinfowler.com". */
  label: string
  /** Where it comes from, said for a row's second line: "GitHub", "Google Docs", the host. */
  source: string
}

const GITHUB = /^github\.com$/i
const GOOGLE = { docs: 'docs.google.com', drive: 'drive.google.com' }

/** The host and path of an http(s) address. No `URL`: this package runs without DOM types. */
const ADDRESS = /^https?:\/\/([^/?#]+)([^?#]*)/i

/** How a resource is shown, from its address alone; an address that is not one reads as plain web. */
export function resourceLook(url: string): ResourceLook {
  const parsed = ADDRESS.exec(url)
  if (!parsed) return { service: 'web', label: url, source: '' }
  const host = parsed[1]!.replace(/^www\./i, '').toLowerCase()
  const path = parsed[2] ?? ''

  if (GITHUB.test(host)) {
    const pr = /^\/[^/]+\/[^/]+\/pull\/(\d+)/.exec(path)
    if (pr) return { service: 'github-pr', label: `#${pr[1]}`, source: 'GitHub' }
    const issue = /^\/[^/]+\/[^/]+\/issues\/(\d+)/.exec(path)
    if (issue) return { service: 'github-issue', label: `#${issue[1]}`, source: 'GitHub' }
    const repo = /^\/([^/]+\/[^/]+)/.exec(path)
    return { service: 'github', label: repo ? repo[1]! : host, source: 'GitHub' }
  }
  if (host === GOOGLE.docs) {
    if (path.startsWith('/document/')) {
      return { service: 'google-doc', label: 'Google Doc', source: 'Google Docs' }
    }
    if (path.startsWith('/spreadsheets/')) {
      return { service: 'google-sheet', label: 'Google Sheet', source: 'Google Sheets' }
    }
    if (path.startsWith('/presentation/')) {
      return { service: 'google-slides', label: 'Google Slides', source: 'Google Slides' }
    }
  }
  if (host === GOOGLE.drive) {
    return { service: 'google-drive', label: 'Drive folder', source: 'Google Drive' }
  }
  if (host === 'overleaf.com') {
    return { service: 'overleaf', label: 'Overleaf project', source: 'Overleaf' }
  }
  if (host === 'figma.com') {
    return { service: 'figma', label: 'Figma file', source: 'Figma' }
  }
  return { service: 'web', label: host, source: host }
}
