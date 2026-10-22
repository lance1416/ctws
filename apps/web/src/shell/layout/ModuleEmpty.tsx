import { useContext } from 'react'
import { BUTTON, KEY_ON_INK } from '../../platform/ui/buttonStyles'
import { KIND_ICON, NewIcon, type Kind } from '../../platform/ui/icons'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import { NewContext } from '../creates'
import { useRegistry } from '../registry'
import { KIND_WORDS } from '../search/view'

/**
 * A MODULE WITH NOTHING IN IT (FR-030, artboard 23): the kind's badge, one line, and the button
 * that fills it. No illustration, no tips.
 */
export function ModuleEmpty({
  kind,
  onNew,
}: {
  kind: Kind
  /** What the button does where the module makes things in place rather than in a dialog. */
  onNew?: () => void
}) {
  const Icon = KIND_ICON[kind]
  const registry = useRegistry()
  const openNew = useContext(NewContext)
  const creator = registry.creates.find((c) => c.kind === kind)
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      {/* The page still names itself for a screen reader; on screen the line says it all. */}
      <h1 className="sr-only">{KIND_WORDS[kind].many}</h1>
      <span className={`inline-grid size-10 place-items-center rounded-control ${KIND_TINT[kind]}`}>
        <Icon size={20} aria-hidden="true" className={KIND_TEXT[kind]} />
      </span>
      <h2 className="text-subject text-ink">No {KIND_WORDS[kind].many.toLocaleLowerCase()} yet</h2>
      {creator && (
        <button
          type="button"
          onClick={() => (onNew ? onNew() : openNew(creator, { opens: true }))}
          className={`${BUTTON.primary} h-7 px-2.5 text-meta`}
        >
          <NewIcon size={14} aria-hidden="true" />
          New {creator.label.toLocaleLowerCase()}
          <kbd className={KEY_ON_INK}>N {creator.key.toUpperCase()}</kbd>
        </button>
      )}
    </div>
  )
}
