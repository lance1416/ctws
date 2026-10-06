import { Fragment, type ReactNode } from 'react'
import { projectRailClass } from '../projectColor'
import type { DateHints } from '../dueAt'
import type { LeadIcon } from '../rowLead'

/**
 * The row system. Every list in the app -- 今天, the project tree, 已完成 and the search results --
 * lays a row out with the SAME parts at the SAME x:
 *
 *   [project rail][status marker 1.75rem][icon slot 1.5rem][title -- the whole line]
 *                                                          [second line: breadcrumb · the dates]
 *
 * WHY AN ICON AND A SECOND LINE, and not the two date columns this replaces (rows-and-reading §2,
 * second edition). The columns scanned well and cost 19rem of every row: inside a 734px panel there
 * was no width left for a title, so the dates had to drop to a second line anyway below a threshold.
 * That made the cramped case and the wide case two layouts. An icon at the row start plus the full
 * wording underneath is ONE layout at every width -- and the wording stops being compressed into a
 * cell, which is the thing the user actually complained about.
 *
 * The icons are the column now: a fixed slot at a fixed x on every row of a list, reserved for the
 * whole list or not at all (`../rowLead`). The second line is deliberately NOT a column -- it is
 * read, not scanned, so nothing is aligned there and nothing is truncated to make it line up.
 */

/** Tree geometry, shared by the tree row and the inline new-task input so they stay aligned. */
export const INDENT_PX = 20
export const HANDLE_PX = 16
export const CHEVRON_PX = 20
/**
 * The project rail's gutter. The rail is at x=0 on EVERY row, BEFORE any depth indentation:
 * it carries project identity only, and depth is carried by the hairline guides (plan section 6,
 * "take off one accessory").
 */
export const RAIL_GUTTER_PX = 12

/** Every row list is a column of rows. (It no longer needs `@container`: nothing asks its width.) */
export const ROW_LIST = 'flex flex-col'
/** 已完成 has one right-hand column (the clock), so it keeps its own, shorter template. */
export const DONE_ROW_GRID = 'grid-cols-[1.75rem_minmax(0,1fr)_4.5rem]'
/**
 * How wide a LIST is, which is not how wide the panel is. At the full 1440 the clock on 已完成 sat
 * 570px from the task it timed; a right-hand column that far from its row is not using the width,
 * it is spending it. The task lists' own measure is a single value in `../rowLead`; 已完成 carries
 * one short column (a clock), so its list is narrower still.
 */
export const DONE_LIST_MEASURE = 'max-w-[36rem]'

/**
 * The 3px bar at x=0. It means ONE thing -- which project this task belongs to -- in every view.
 * On a cross-project list (今天, 已完成, search) that makes "which project is this" pre-attentive;
 * in a project tree it is one continuous spine.
 *
 * `aria-hidden`, and never the only carrier: there are six hues and more projects than that, so
 * two projects can share one. The project's NAME is always on the row as well (WCAG 1.4.1). The
 * rail is a hint for the eye, not an identifier.
 */
export function ProjectRail({
  projectId,
  continuous = false,
  at = 'left-0',
}: {
  projectId: string
  /**
   * True inside a project tree, where every row is the same project: the rail runs the full
   * height of each row and square, so the rows join into ONE spine rather than a column of
   * dashes. On a cross-project list each row is a separate project, so each rail is its own
   * rounded segment.
   */
  continuous?: boolean
  /** Where x=0 is for this list. The search overlay insets it, so the rail is not mistaken for
   *  a piece of the dialog's own rounded edge. */
  at?: string
}) {
  return (
    <span
      aria-hidden="true"
      data-project-rail={projectId}
      className={`pointer-events-none absolute w-[3px] ${at} ${
        continuous ? 'inset-y-0' : 'top-1 bottom-1 rounded-full'
      } ${projectRailClass(projectId)}`}
    />
  )
}

/**
 * A deadline's glyph: a flag on a pole. Upright, with a vertical silhouette.
 *
 * The two date semantics must not differ by HUE ALONE (plan section 2). They differ in three
 * channels: the words ("…截止" against "排到…"), the colour family (warm against cool) and -- this
 * -- the shape. A flag is a line you must not cross; it is filled once the line has been crossed.
 */
export function DeadlineMark({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M3.25 1.5V11" />
      <path d="M3.25 2.6L9.75 4.4 3.25 6.2z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}

/**
 * A plan's glyph: a tick on a timeline. Deliberately HORIZONTAL, so in a grey screenshot (or to a
 * colourblind reader) a plan and a deadline are told apart by silhouette alone.
 */
export function PlanMark() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="14"
      height="14"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M1 8.75h10" />
      <path d="M6 4.25v4.5" />
    </svg>
  )
}

/**
 * A notes glyph: three ruled lines, the shortest last. Prose, at a glance, and nothing like either
 * date glyph (an upright flag, a wide timeline tick) it shares the slot with.
 */
export function NotesMark() {
  return (
    <svg
      aria-hidden="true"
      data-notes-mark
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      className="shrink-0"
    >
      <path d="M2.5 4h9" />
      <path d="M2.5 7h9" />
      <path d="M2.5 10h5" />
    </svg>
  )
}

/**
 * The names the leading icons answer to. Every icon has one (spec §2, 无障碍): an icon with no name
 * is a WCAG 1.1.1 failure, and here it would also leave a reader who cannot see the colour without
 * the one thing the glyph is for.
 *
 * 「有备注」 and not 「备注」, on purpose: accessible names share ONE FLAT NAMESPACE and are
 * matched by substring, and a bare 备注 would collide with the detail pane's own 备注 field on the
 * very page both appear on. For the same reason the missed deadline is 「截止已过」 and not
 * 「有截止，已逾期」: a name that CONTAINS 「有截止」 makes every by-name query for the un-missed
 * flag match the missed one too. The plan's name is §2's own word, 「有计划」, which is also the one
 * that does NOT contain the pane's 排期 field.
 *
 * 「有截止」 does contain the pane's 截止 field, and there is no word for a deadline in this app's
 * vocabulary that does not; the queries that mean that FIELD say `{ exact: true }`.
 */
const LEAD_LABEL: Record<LeadIcon, string> = {
  missed: '截止已过',
  deadline: '有截止',
  plan: '有计划',
  notes: '有备注',
}

/** The tone each icon is drawn in. Never the only carrier: the second line says it in words. */
const LEAD_TONE: Record<LeadIcon, string> = {
  missed: 'text-missed',
  deadline: 'text-deadline',
  plan: 'text-plan',
  notes: 'text-fg-subtle',
}

/**
 * THE ROW'S LEADING ICON. One glyph, no text: it answers only 「有没有、急不急」, and the second
 * line under the title carries the information itself.
 *
 * `role="img"` with a name of its own rather than `aria-hidden`: it accelerates the reading for an
 * eye, so it must not be the one thing a screen reader is missing.
 */
export function LeadMark({ icon }: { icon: LeadIcon }) {
  return (
    <span
      role="img"
      aria-label={LEAD_LABEL[icon]}
      data-lead-icon={icon}
      className={`flex items-center justify-center ${LEAD_TONE[icon]}`}
    >
      {icon === 'notes' ? (
        <NotesMark />
      ) : icon === 'plan' ? (
        <PlanMark />
      ) : (
        <DeadlineMark filled={icon === 'missed'} />
      )}
    </span>
  )
}

/**
 * THE SECOND LINE: the breadcrumb and the dates, in full words.
 *
 * This is where the information actually lives (spec §2, 无障碍). The icon at the row start says
 * there IS a deadline and whether it has been missed; this says which one and when, to the minute,
 * and it says it in TEXT -- so colour is never the only carrier (WCAG 1.4.1) and a screen reader
 * reaching the row gets the date from the words rather than from a hue.
 *
 * It renders NOTHING when there is nothing to say, so a row with no date, no plan and no breadcrumb
 * stays one line (44px) and only the rows that carry information pay for the second one (58px).
 *
 * No alignment, no truncated dates: this line is read, not scanned (§2). Each phrase is kept whole
 * (`whitespace-nowrap` per part) so a narrow panel breaks the line BETWEEN phrases rather than
 * inside 「已逾 2 天」.
 */
export function RowMeta({
  breadcrumb = null,
  due = null,
  plan = null,
  carried = false,
  exact,
  summary = false,
}: {
  /** The project (and parent) a cross-project list shows. The tree passes none: §2 says the
   *  project is known there and the hierarchy is visible from the indentation. */
  breadcrumb?: string | null
  due?: DateHints['due']
  /** The plan, worded: "排到明天", or "原定9月28日，已顺延" once it has been carried. */
  plan?: string | null
  carried?: boolean
  /** The exact local deadline, for the tooltip: "2026-10-01 09:00". */
  exact?: string | undefined
  /**
   * A SUMMARY SURFACE's line: the project and how late, nothing else.
   *
   * This is a per-surface editorial choice, not a compression of the row's vocabulary (spec §2
   * stands: wherever the full line is shown it is whole, to the minute). The 逾期 panel is a
   * one-third-width summary of "what is late, and how late"; with the absolute deadline and the
   * plan added, every row wrapped to three lines and the titles truncated anyway. The absolute
   * deadline is NOT lost: it is on the same task's row in the main 今天 queue, in the detail pane,
   * and in this line's tooltip (`exact`). A deadline that is not yet past a whole day has no
   * "已逾" phrase to show, so it falls back to the full wording rather than to nothing.
   */
  summary?: boolean
}) {
  type Part = { node: ReactNode; cap?: boolean }
  const parts: Part[] = (
    [
      breadcrumb
        ? {
            // Half the line at most (`cap`). A project-and-parent breadcrumb can be longer than the whole
            // second line, and as a flex item that long it takes the line to itself and pushes the date
            // onto a third one -- which spends a row's height on the part that matters least. Capped, it
            // truncates and the date keeps its place beside it.
            cap: true,
            node: (
              <span key="crumb" data-row-crumb className="min-w-0 truncate">
                {breadcrumb}
              </span>
            ),
          }
        : null,
      due && !(summary && due.late)
        ? {
            node: (
              <span
                key="due"
                data-due-text
                data-date-hint={due.overdue ? 'overdue' : 'due'}
                title={exact}
                className={`whitespace-nowrap tabular-nums ${
                  due.overdue ? 'text-missed' : 'text-deadline'
                }`}
              >
                {due.text}
              </span>
            ),
          }
        : null,
      due?.late
        ? {
            node: (
              // How late, as a phrase of its own: the separator between it and the deadline is the line's
              // own ·, so a narrow row breaks between the two instead of overflowing with one 230px word.
              <span
                key="late"
                data-late-text
                title={summary ? exact : undefined}
                className="whitespace-nowrap text-missed"
              >
                {due.late}
              </span>
            ),
          }
        : null,
      plan && !summary
        ? {
            node: (
              <span
                key="plan"
                data-plan-text
                data-date-hint={carried ? 'carried' : 'scheduled'}
                className="whitespace-nowrap text-plan"
              >
                {plan}
              </span>
            ),
          }
        : null,
    ] as (Part | null)[]
  ).filter((part): part is Part => part !== null)
  if (parts.length === 0) return null
  return (
    // 元信息: 14/22, weight 400, from the typography spec's scale -- and 400 for EVERY phrase on
    // this line, including the overdue date, the 已逾 phrase and a carried plan, which each used
    // to be 500. The spec publishes no 600 step at 14/22 (only at 16/24, 行标题（强调）), and 500
    // does not exist any more: it is a no-op on the Microsoft YaHei fallback path. The three
    // emphases lose nothing they were the sole carrier of -- the deadline keeps `missed` against
    // `deadline`, the row keeps its own leading glyph, and the lateness is spelled out in words
    // (WCAG 1.4.1 was never satisfied by the weight here).
    <span
      data-row-meta
      className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm text-fg-muted"
    >
      {parts.map((part, i) => (
        // The separator travels WITH the phrase it follows, inside one flex item: loose, it can be
        // pushed onto the next line and start it with a stray ·. And it is hidden from assistive
        // technology -- read aloud, a · between two nodes that are already separate is noise.
        <Fragment key={i}>
          <span
            className={`flex min-w-0 items-baseline gap-x-1.5 ${part.cap ? 'max-w-[50%]' : ''}`}
          >
            {part.node}
            {i < parts.length - 1 && (
              <span aria-hidden="true" className="text-fg-subtle">
                ·
              </span>
            )}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/** A momentary "已保存" after a save from the detail panel. It sits inline after the title rather
 * than in a column, so it never reserves width and never moves one. */
export function SavedMark() {
  return (
    <span role="status" className="ml-2 shrink-0 text-sm font-normal text-fg-muted">
      已保存
    </span>
  )
}
