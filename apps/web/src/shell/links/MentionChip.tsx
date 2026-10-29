import type { Mention } from '../../platform/notes/mention'
import { KIND_ICON } from '../../platform/ui/icons'
import { KIND_ON_TINT, KIND_TINT } from '../../platform/ui/kinds'
import { useInspector } from '../layout/inspectorAddress'
import { useInspectorGo } from '../inspector/narrow'

/**
 * A mention in a note, as the app reads it (FR-042, I-03): its kind's icon and the name on its
 * kind's tint, as in Linked; a click opens the thing in the inspector, the page staying put.
 */
export function MentionChip({ type, id, words }: Mention) {
  const { show } = useInspector()
  // Inside the inspector it takes the inspector's place, ‹ back to what mentioned it (BUG-069).
  const go = useInspectorGo()
  const Icon = KIND_ICON[type]
  const name = words.replace(/^@/, '')
  return (
    <button
      type="button"
      data-mention={type}
      onClick={() => (go ? go({ type, id }) : show({ type, id }))}
      className={`mx-0.5 inline-flex h-5.5 max-w-full items-center gap-1.25 rounded-control px-1.5 align-[-0.3em] text-meta font-medium hover:underline ${KIND_TINT[type]} ${KIND_ON_TINT[type]}`}
    >
      <Icon size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{name}</span>
    </button>
  )
}
