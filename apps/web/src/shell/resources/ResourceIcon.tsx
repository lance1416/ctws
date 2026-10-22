import { resourceLook } from '@ctws/core'
import { RESOURCE_ICON } from '../../platform/ui/icons'

/** A resource's service, told from its address alone (FR-046); grey whatever the service. */
export function ResourceIcon({ url, size = 14 }: { url: string; size?: 14 | 16 }) {
  const Icon = RESOURCE_ICON[resourceLook(url).service]
  return <Icon size={size} aria-hidden="true" className="shrink-0 text-muted" />
}
