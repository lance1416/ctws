import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { inboxOf, listProjects } from '../api/projects'
import { createTask } from '../api/tasks'
import { refreshTasks } from '../api/taskCache'
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || !isBareKey(e)) return
      if (isTypingTarget(e.target) || isOverlayOpen()) return
      e.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div className="relative order-3 basis-full sm:order-2 sm:flex-1 sm:basis-0 lg:col-start-2 lg:row-start-1">
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
          className="h-9 w-full border-b border-border-strong bg-transparent pr-8 pl-0.5 text-fg placeholder:text-fg-muted disabled:opacity-50"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border-strong px-1.5 text-xs leading-5 text-fg-muted"
        >
          /
        </kbd>
      </div>
      {missing && (
        <p role="alert" className="order-4 basis-full text-sm text-danger lg:col-start-2">
          没有找到收件箱，无法捕获。请刷新页面；若仍然如此，请联系管理员检查数据库迁移。
        </p>
      )}
      {/* role="status", not "alert": on the projects page the list already raises its own alert
          for the same failed fetch, and two alerts would be announced (and matched) twice. */}
      {projects.isError && (
        <p role="status" className="order-4 basis-full text-sm text-danger lg:col-start-2">
          无法加载收件箱，暂时不能捕获。请检查网络后刷新页面
        </p>
      )}
      {landed && inbox && (
        <p
          role="status"
          className="order-4 basis-full truncate text-sm text-fg-muted lg:col-start-2"
        >
          已放入{' '}
          <Link to={`/projects/${inbox.id}`} className="text-accent underline">
            {inbox.name}
          </Link>
        </p>
      )}
      {capture.isError && (
        <p role="alert" className="order-4 basis-full text-sm text-danger lg:col-start-2">
          捕获失败，内容仍保留在输入框中，请重试
        </p>
      )}
    </>
  )
}
