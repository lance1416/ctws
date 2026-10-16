import { z } from 'zod'
import { envFlag } from '../../platform/config'
import type { EnvSource } from '../../shell/module'

const raw = z.object({
  // Whether a pasted link's own title is fetched: the API's only outbound request. Off, a link
  // shows its host and path.
  READING_UNFURL: envFlag(true),
})

/** Reading's own settings, read from the environment. */
export function readingConfig(env: EnvSource): { unfurl: boolean } {
  return { unfurl: raw.parse(env).READING_UNFURL }
}
