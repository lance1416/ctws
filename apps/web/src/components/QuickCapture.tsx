import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { inboxOf, listProjects } from '../api/projects'
import { createTask } from '../api/tasks'
import { refreshTasks } from '../api/taskCache'
import { useShortcutsEnabled } from '../shortcuts/enabled'
import { isBareKey, isTypingTarget } from '../shortcuts/keys'
import { isOverlayOpen } from './overlayState'

// One input on every page: the destination is always the inbox, so there is nothing to choose.
export function QuickCapture() {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  // Set when a capture lands; cleared by the next keystroke or navigation. One line, never a
  // queue. It names the destination but not the title: the title would sit in the DOM of every
  // page (this box is in the layout) and show up twice wherever that task is also listed.
  const [landed, setLanded] = useState(false)
  const { pathname } = useLocation()
  const shortcuts = useShortcutsEnabled()
  useEffect(() => setLanded(false), [pathname])
  const input = useRef<HTMLInputElement>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const inbox = projects.data ? inboxOf(projects.data) : undefined
  const missing = projects.isSuccess && !inbox

  const capture = useMutation({
    mutationFn: (t: string) => createTask({ projectId: inbox!.id, title: t }),
    onSuccess: () => {
      setTitle('')
      setLanded(true)
      return refreshTasks(qc, inbox!.id)
    },
  })

  const submit = () => {
    const t = title.trim()
    if (!t || !inbox || capture.isPending) return
    capture.mutate(t)
  }

  // `/` jumps to the capture box from anywhere that is not already a text field. The guard is
  // now shared with the other document-level keys (`f`, `?`, the `g` chords) rather than
  // duplicated, and it also stands down while an overlay owns the keyboard.
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || !isBareKey(e)) return
      if (isTypingTarget(e.target) || isOverlayOpen()) return
      e.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [shortcuts])

  return (
    <>
      {/* The first thing in the bar, and the widest: capture is the one action taken from every
          page. It is capped rather than fluid -- a 1400px-wide single-line input looks like a
          search engine, and the thought being thrown in is a line, not a paragraph. */}
      <div className="relative order-1 w-full min-w-0 sm:max-w-[44ch] sm:flex-1">
        {/* The rail, at the same fixed x position the project rails use, so the bar reads as
            part of the same system rather than a floating search box. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent"
        />
        <input
          ref={input}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setLanded(false)
          }}
          onKeyDown={(e) => {
            // isComposing: Enter confirms an IME candidate, it must not submit half a word.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit()
          }}
          placeholder="捕获…"
          disabled={!inbox}
          aria-label="捕获"
          className="h-9 w-full rounded-md border border-border-strong bg-surface pr-8 pl-3 text-fg placeholder:text-fg-muted disabled:opacity-50"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border-strong px-1.5 text-2xs leading-5 text-fg-muted"
        >
          /
        </kbd>
      </div>
      {missing && (
        <p role="alert" className="order-3 w-full text-sm text-danger">
          没有找到收件箱，无法捕获。请刷新页面；若仍然如此，请联系管理员检查数据库迁移。
        </p>
      )}
      {/* role="status", not "alert": on the projects page the list already raises its own alert
          for the same failed fetch, and two alerts would be announced (and matched) twice. */}
      {projects.isError && (
        <p role="status" className="order-3 w-full text-sm text-danger">
          无法加载收件箱，暂时不能捕获。请检查网络后刷新页面
        </p>
      )}
      {landed && inbox && (
        <p role="status" className="order-3 w-full truncate text-sm text-fg-muted">
          已放入{' '}
          <Link to={`/projects/${inbox.id}`} className="text-accent underline">
            {inbox.name}
          </Link>
        </p>
      )}
      {capture.isError && (
        <p role="alert" className="order-3 w-full text-sm text-danger">
          捕获失败，内容仍保留在输入框中，请重试
        </p>
      )}
    </>
  )
}
