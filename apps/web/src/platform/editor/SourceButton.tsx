import { ICON_BUTTON } from '../ui/buttonStyles'
import { FileCodeIcon } from '../ui/icons'
import { SOURCE_KEYS } from './noteKeys'

/** What the switch to the source says it does: show the source, or draw the note again. */
export const sourceWords = (source: boolean) => (source ? 'Show it drawn' : 'Show source')

/** The title row's switch to the note's source and back (REQ-002 FR-116), pressed while shown. */
export function SourceButton({ source, onSource }: { source: boolean; onSource: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={source}
      aria-label="Source"
      title={`${sourceWords(source)} (${SOURCE_KEYS})`}
      onClick={onSource}
      className={`${ICON_BUTTON} aria-pressed:bg-select aria-pressed:text-ink`}
    >
      <FileCodeIcon size={16} aria-hidden="true" />
    </button>
  )
}
