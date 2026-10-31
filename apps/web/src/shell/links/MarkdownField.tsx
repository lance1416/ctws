import type { LinkCandidate, ObjectType } from '@ctws/contracts'
import { useQueryClient } from '@tanstack/react-query'
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useState,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import type {
  EditorHandle,
  EditorMentions,
  MentionOption,
} from '../../platform/editor/MarkdownEditor'
import { KIND_ICON } from '../../platform/ui/icons'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { useMe } from '../auth/useMe'
import { useRegistry } from '../registry'
import { everythingQuery } from '../search/api'
import { recentList } from '../search/recent'
import { KIND_ORDER, KIND_WORDS } from '../search/view'
import { MentionChip } from './MentionChip'
import { MentionArea, useMentionText } from './MentionArea'

/** The editor's code, fetched where writing starts and nowhere a note is only read (REQ-002 §5). */
const MarkdownEditor = lazy(() => import('../../platform/editor/MarkdownEditor'))

/** How many of each kind `@` offers, as the text box does. */
const PER_KIND = 4

type Field = {
  /** The text as stored, mentions as links. */
  value: string
  onChange: (next: string) => void
  /** Its name to a screen reader. */
  label: string
  placeholder?: string
  autoFocus?: boolean
  className?: string
  /** The editor's own controls, once it has arrived (the outline's jump). */
  handle?: RefObject<EditorHandle | null>
  /** Where the cursor is, as it moves. */
  onCursor?: (offset: number) => void
  /** Ctrl F in the editor, where the page has a find bar. */
  onFind?: () => void
  /** The stand-in text box's own look, while the editor loads or where it could not. */
  fallback?: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>
}

/**
 * WHERE MARKDOWN IS WRITTEN (REQ-002 FR-106): the one editor, live preview and `@`, fetched on
 * first use. Until it has arrived, and if it never does (offline, a deploy between), the text box
 * the app had stands in: the same text, saved the same way, so nothing written is lost.
 */
export function MarkdownField({ fallback, ...field }: Field) {
  const mentions = useEditorMentions()
  const standIn = <StandIn {...field} box={fallback ?? {}} />
  return (
    <>
      <StandInOnFailure standIn={standIn}>
        <Suspense fallback={standIn}>
          <MarkdownEditor {...field} mentions={mentions.editor} />
        </Suspense>
      </StandInOnFailure>
      {mentions.portals}
    </>
  )
}

/** The text box the editor stands on, its mentions as words. */
function StandIn({
  value,
  onChange,
  label,
  placeholder,
  autoFocus,
  box,
}: Field & { box: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> }) {
  const mentioned = useMentionText(value, onChange)
  return (
    <MentionArea
      {...box}
      {...mentioned}
      aria-label={label}
      {...(placeholder ? { placeholder } : {})}
      {...(autoFocus ? { autoFocus } : {})}
    />
  )
}

/** The editor that failed to load gives way to the text box, for the rest of the visit. */
class StandInOnFailure extends Component<{ standIn: ReactNode; children: ReactNode }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override render() {
    return this.state.failed ? this.props.standIn : this.props.children
  }
}

/**
 * What `@` needs from the app: search's ranking, each kind's mark and the chip the reader draws.
 * The marks and chips are React, drawn into the editor's own elements through portals, so they
 * keep the app's router, data and inspector.
 */
function useEditorMentions(): { editor: EditorMentions; portals: ReactNode[] } {
  const qc = useQueryClient()
  const registry = useRegistry()
  const userId = useMe().data?.id
  const [recent] = useState(() => (userId ? recentList(userId).map((r) => r.id) : []))
  const [drawn, setDrawn] = useState<ReadonlyMap<HTMLElement, ReactNode>>(() => new Map())
  // What search said of each thing offered, for its mark in the list.
  const [found] = useState(() => new Map<string, LinkCandidate>())

  const host = useCallback((node: ReactNode) => {
    const el = document.createElement('span')
    // Rows of a list the editor has closed are gone from the page: their portals go with the next.
    setDrawn((was) => new Map([...[...was].filter(([e]) => e.isConnected), [el, node]]))
    return el
  }, [])
  const release = useCallback((el: HTMLElement) => {
    setDrawn((was) => new Map([...was].filter(([e]) => e !== el)))
  }, [])

  const editor: EditorMentions = {
    search: async (words) => {
      const hits = await qc.fetchQuery(everythingQuery(words, recent))
      return KIND_ORDER.flatMap((type) =>
        (hits.groups.find((g) => g.type === type)?.items.slice(0, PER_KIND) ?? []).map(
          (t): MentionOption => {
            found.set(`${t.type}:${t.id}`, t)
            return { type: t.type, id: t.id, title: t.title, section: KIND_WORDS[t.type].many }
          },
        ),
      )
    },
    mark: (option) => {
      // Each kind's own mark, as search draws it: a person's initials, a project's square.
      const { Mark } = registry.relationFor(option.type)
      const thing = found.get(`${option.type}:${option.id}`)
      const Icon = KIND_ICON[option.type]
      return host(
        Mark && thing ? (
          <Mark thing={thing} />
        ) : (
          <Icon size={14} aria-hidden="true" className={`shrink-0 ${KIND_TEXT[option.type]}`} />
        ),
      )
    },
    draw: (type: ObjectType, id: string, words: string) =>
      host(<MentionChip type={type} id={id} words={words} />),
    release,
  }
  return { editor, portals: [...drawn].map(([el, node], i) => createPortal(node, el, String(i))) }
}
