import type { LinkCandidate } from '@ctws/contracts'
import { mentionAddress } from '@ctws/core'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react'
import { mentionsAsLinks, mentionsAsWords } from '../../platform/notes/mention'
import { useComposing } from '../../platform/keyboard/composition'
import { useDebouncedValue } from '../../platform/time/useDebouncedValue'
import { caretPoint } from '../../platform/ui/caretPoint'
import { KIND_ICON } from '../../platform/ui/icons'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { LAYER } from '../../platform/ui/layers'
import { useRegistry } from '../registry'
import { everythingQuery } from '../search/api'
import { KIND_ORDER, KIND_WORDS } from '../search/view'

/** How many of each kind the list offers. */
const PER_KIND = 4

/** An `@` that starts a word, and what has been typed after it up to the caret. */
const TYPING = /(?:^|[\s([{（，。,;；:：])@([^\s@]{1,40})$/u

type Asked = { from: number; words: string }

/** The `@words` being typed at the caret, if the caret is in one. */
function askedAt(text: string, caret: number): Asked | null {
  const m = TYPING.exec(text.slice(0, caret))
  return m ? { from: caret - m[1]!.length - 1, words: m[1]! } : null
}

/**
 * A text box where `@` names something (FR-042, DES-001): typing `@Mi` opens search's list under
 * the caret, by kind; the one chosen is written as `@Mira Chen`, and `onMention` learns where those
 * words go. The words stay plain in the box (I-09); where the text is read, they are a chip.
 */
export function MentionArea({
  value,
  onText,
  onMention,
  onKeyDown,
  onBlur,
  ref,
  ...box
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onText: (text: string) => void
  onMention: (words: string, address: string) => void
  ref?: Ref<HTMLTextAreaElement>
}) {
  const area = useRef<HTMLTextAreaElement | null>(null)
  const composing = useComposing()
  const listId = useId()
  const [asked, setAsked] = useState<Asked | null>(null)
  // Esc puts the list away until the caret leaves those words.
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [pointed, setPointed] = useState(0)
  const [point, setPoint] = useState({ left: 0, top: 0 })
  // Where the caret goes once the chosen words are in the box.
  const caretAfter = useRef<number | null>(null)

  const words = useDebouncedValue(asked?.words ?? '')
  const hits = useQuery({
    ...everythingQuery(words),
    enabled: words !== '',
    placeholderData: keepPreviousData,
  })
  const open = asked !== null && asked.from !== dismissed && words !== ''
  const groups = open
    ? KIND_ORDER.flatMap((type) => {
        const items = hits.data?.groups.find((g) => g.type === type)?.items.slice(0, PER_KIND)
        return items?.length ? [{ type, items }] : []
      })
    : []
  const rows: LinkCandidate[] = groups.flatMap((g) => g.items)
  const active = Math.min(pointed, Math.max(rows.length - 1, 0))
  const shown = open && rows.length > 0

  /** What the caret is in, read after each change of the text or of the caret. */
  const look = (el: HTMLTextAreaElement) => {
    const next = el.selectionStart === el.selectionEnd ? askedAt(el.value, el.selectionStart) : null
    if (next?.from !== asked?.from || next?.words !== asked?.words) setPointed(0)
    setAsked(next)
    if (next === null || next.from !== dismissed) setDismissed(null)
    if (next) {
      const at = caretPoint(el, next.from)
      setPoint({ left: el.offsetLeft + at.left, top: el.offsetTop + at.bottom })
    }
  }

  const choose = (thing: LinkCandidate) => {
    if (!asked) return
    const said = `@${thing.title}`
    const caret = area.current?.selectionStart ?? asked.from + asked.words.length + 1
    onMention(said, mentionAddress(thing.type, thing.id))
    onText(`${value.slice(0, asked.from)}${said} ${value.slice(caret)}`)
    caretAfter.current = asked.from + said.length + 1
    setAsked(null)
  }

  useLayoutEffect(() => {
    const el = area.current
    if (caretAfter.current === null || !el) return
    el.setSelectionRange(caretAfter.current, caretAfter.current)
    caretAfter.current = null
  })

  return (
    <div className="relative">
      <textarea
        {...box}
        ref={(el) => {
          area.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        value={value}
        // Still a text box while the list is up: what is typed is prose, the list a help to it.
        aria-controls={shown ? listId : undefined}
        aria-autocomplete={shown ? 'list' : undefined}
        aria-activedescendant={shown ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onText(e.target.value)
          look(e.target)
        }}
        onSelect={(e) => look(e.currentTarget)}
        {...composing.bind}
        onKeyDown={(e) => {
          if (shown && !composing.composingNow(e)) {
            const plain = !(e.ctrlKey || e.metaKey || e.altKey)
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setPointed((active + 1) % rows.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setPointed((active - 1 + rows.length) % rows.length)
              return
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && plain && !e.shiftKey) {
              e.preventDefault()
              // Words not yet asked would choose from the last words' list.
              if (words === asked.words && !hits.isPlaceholderData) choose(rows[active]!)
              return
            }
            if (e.key === 'Escape') {
              // The list goes; the editor it sits in stays.
              e.preventDefault()
              e.stopPropagation()
              setDismissed(asked.from)
              return
            }
          }
          onKeyDown?.(e)
        }}
        onBlur={(e) => {
          setAsked(null)
          onBlur?.(e)
        }}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Mention"
          style={{ left: point.left, top: point.top }}
          className={`absolute ${LAYER.menu} mt-1 max-h-72 w-72 max-w-full overflow-y-auto rounded-block bg-float py-1 shadow-float`}
        >
          {groups.map((g) => (
            <li key={g.type} role="presentation">
              <div className="px-3 pt-1.5 pb-0.5 text-meta text-subtle">
                {KIND_WORDS[g.type].many}
              </div>
              <ul role="presentation">
                {g.items.map((thing) => {
                  const i = rows.indexOf(thing)
                  return (
                    <MentionRow
                      key={`${thing.type}:${thing.id}`}
                      id={`${listId}-${i}`}
                      thing={thing}
                      active={i === active}
                      onPoint={() => setPointed(i)}
                      onChoose={() => choose(thing)}
                    />
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MentionRow({
  id,
  thing,
  active,
  onPoint,
  onChoose,
}: {
  id: string
  thing: LinkCandidate
  active: boolean
  onPoint: () => void
  onChoose: () => void
}) {
  // Each kind's own mark, as search draws it: a person's initials, a project's square.
  const { Mark } = useRegistry().relationFor(thing.type)
  const Icon = KIND_ICON[thing.type]
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      // `onMouseDown`: the box keeps focus, so the caret is where the words go.
      onMouseDown={(e) => {
        e.preventDefault()
        onChoose()
      }}
      onMouseEnter={onPoint}
      className={`flex h-8 cursor-pointer items-center gap-2 px-3 text-ui text-ink ${
        active ? 'bg-select' : ''
      }`}
    >
      {Mark ? (
        <Mark thing={thing} />
      ) : (
        <Icon size={14} aria-hidden="true" className={`shrink-0 ${KIND_TEXT[thing.type]}`} />
      )}
      <span className="truncate">{thing.title}</span>
    </li>
  )
}

/**
 * A stored text's mentions as words in the box and links in what is saved: the box gets `value`,
 * `onText` and `onMention`; `stored` gets the text with each mention its link again.
 */
export function useMentionText(stored: string, onStored: (next: string) => void) {
  const links = useRef(new Map<string, string>())
  const { text, links: found } = mentionsAsWords(stored)
  for (const [w, href] of found) if (!links.current.has(w)) links.current.set(w, href)
  return {
    value: text,
    onText: (next: string) => onStored(mentionsAsLinks(next, links.current)),
    onMention: (words: string, address: string) => links.current.set(words, address),
  }
}
