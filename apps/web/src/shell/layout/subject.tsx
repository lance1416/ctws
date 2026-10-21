import type { ObjectType } from '@ctws/contracts'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** The thing a page is about: what `L` links from, and what a New in its head belongs to. */
export type Subject = { type: ObjectType; id: string; title: string }

type Held = { subject: Subject | null; setSubject: (s: Subject | null) => void }
const SubjectContext = createContext<Held | null>(null)

export function SubjectProvider({ children }: { children: ReactNode }) {
  const [subject, setSubject] = useState<Subject | null>(null)
  return (
    <SubjectContext.Provider value={{ subject, setSubject }}>{children}</SubjectContext.Provider>
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
