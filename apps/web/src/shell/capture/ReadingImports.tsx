import { useState } from 'react'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { PLACE_ICON, ScanIcon, ShareInIcon } from '../../platform/ui/icons'

/**
 * READING'S IMPORTS, NOT BUILT THIS ROUND (FR-102, artboard 26): a book found by its title or its
 * barcode, and links shared in from other apps. Their places are here so the way in is known; each
 * says "Coming later" when pressed (FR-089), and nothing is asked of any book service.
 */
export function ReadingImports() {
  const [soon, setSoon] = useState(false)
  const later = () => setSoon(true)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={later}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-control border border-line-strong bg-panel px-2.5 text-ui text-subtle max-lg:h-11"
        >
          <PLACE_ICON.search size={16} aria-hidden="true" className="shrink-0" />
          <span className="truncate">Search books by title</span>
        </button>
        <button
          type="button"
          onClick={later}
          aria-label="Scan a barcode"
          className={`${ICON_BUTTON} size-8 bg-hover`}
        >
          <ScanIcon size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-2.5 rounded-control border border-line px-2.5 py-2">
        <ShareInIcon size={16} aria-hidden="true" className="shrink-0 text-muted" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ui text-ink">Share to CTWS</span>
          <span className="truncate text-meta text-subtle">From Safari, WeChat, Douban</span>
        </span>
        <button
          type="button"
          onClick={later}
          aria-label="Set up Share to CTWS"
          className={`${BUTTON.small} h-7 px-2.5 text-meta`}
        >
          Set up
        </button>
      </div>
      {soon && (
        <p role="status" className="text-ui text-muted">
          Coming later
        </p>
      )}
    </div>
  )
}
