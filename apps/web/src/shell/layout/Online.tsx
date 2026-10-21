import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useOnline } from '../../platform/http/online'
import { useNow } from '../../platform/time/useNow'
import { OfflineIcon, OnlineIcon } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { clockTime } from '@ctws/core'
import { useTimeZone } from '../auth/useMe'

/**
 * OFFLINE (FR-033): an amber pill beside the account while the connection is gone; the page stays
 * readable as it was last loaded. Nothing is queued behind your back.
 */
export function OfflinePill() {
  const online = useOnline()
  const zone = useTimeZone()
  const now = useNow()
  // When the connection went: what is shown was loaded no later than this.
  const since = useRef<Date | null>(null)
  if (!online && since.current === null) since.current = now
  if (online) since.current = null
  if (online) return null
  const at = since.current ? clockTime(since.current, zone) : ''
  return (
    <span
      role="status"
      title={`Showing what was loaded at ${at}. Nothing can be saved until the connection is back.`}
      className="inline-flex h-6.5 items-center gap-1.5 rounded-full bg-warn-bg px-2.5 text-meta font-medium text-warn-t"
    >
      <OfflineIcon size={14} aria-hidden="true" />
      Offline
    </span>
  )
}

/** BACK ONLINE: lists reload by themselves, and the note fades after a few seconds. */
export function BackOnline() {
  const online = useOnline()
  const qc = useQueryClient()
  const wasOffline = useRef(false)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    void qc.invalidateQueries()
    setShown(true)
    const timer = setTimeout(() => setShown(false), 4000)
    return () => clearTimeout(timer)
  }, [online, qc])
  if (!shown) return null
  return (
    <div
      role="status"
      className={`fixed bottom-5 left-5 ${LAYER.cover} flex items-center gap-2.5 rounded-block bg-float px-3.5 py-2.5 text-ui shadow-float max-lg:bottom-20`}
    >
      <OnlineIcon size={16} aria-hidden="true" className="text-go" />
      <span className="font-medium text-ink">Back online</span>
      <span className="text-muted">Lists are up to date</span>
    </div>
  )
}
