import type { ObjectType } from '@ctws/contracts'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** The thing a page is about: what `L` links from, and what a New in its head belongs to. */
export type Subject = { type: ObjectType; id: string; title: string }

type Held = {
  subject: Subject | null
  setSubject: (s: Subject | null) => void
  /** What the inspector shows, by name once its page has said it. */
  inspected: Subject | null
  setInspected: (s: Subject | null) => void
}
const SubjectContext = createContext<Held | null>(null)

export function SubjectProvider({ children }: { children: ReactNode }) {
  const [subject, setSubject] = useState<Subject | null>(null)
  const [inspected, setInspected] = useState<Subject | null>(null)
  return (
    <SubjectContext.Provider value={{ subject, setSubject, inspected, setInspected }}>
      {children}
    </SubjectContext.Provider>
  )
}

/** A page says what it is about while it is shown; leaving it, or losing the thing, clears it. */
export function useSubjectOf(subject: Subject | null): void {
  const held = useContext(SubjectContext)
  const set = held?.setSubject
  const key = subject ? `${subject.type}:${subject.id}:${subject.title}` : null
  useEffect(() => {
    if (!set) return
    set(subject)
    return () => set(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the subject's parts.
  }, [set, key])
}

/** The current page's subject, for the frame. */
export function useSubject(): Subject | null {
  return useContext(SubjectContext)?.subject ?? null
}

/** The inspector says what it shows while it shows it. */
export function useInspectedOf(thing: Subject | null): void {
  const set = useContext(SubjectContext)?.setInspected
  const key = thing ? `${thing.type}:${thing.id}:${thing.title}` : null
  useEffect(() => {
    if (!set) return
    set(thing)
    return () => set(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the thing's parts.
  }, [set, key])
}

/**
 * What `L` links from: the thing open in the inspector, as N L pins on it (FR-029); else the
 * page's own (BUG-080).
 */
export function useLinkSubject(): Subject | null {
  const held = useContext(SubjectContext)
  return held?.inspected ?? held?.subject ?? null
}

/** The name of `thing` when it is the page's or the inspector's, for a heading that names it. */
export function useNameOf(thing: { type: ObjectType; id: string }): string | null {
  const held = useContext(SubjectContext)
  const same = (s: Subject | null | undefined) => s && s.type === thing.type && s.id === thing.id
  return (
    (same(held?.inspected) ? held!.inspected!.title : null) ??
    (same(held?.subject) ? held!.subject!.title : null)
  )
}
