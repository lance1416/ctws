/**
 * THE ICON VOCABULARY (FR-006, artboard 3): Lucide, 2px stroke on a 24 grid, drawn at 16 in a
 * row, 20 in a block head, 12 in a chip, 24 in the phone's tab bar. Grey unless the icon names a
 * kind or a state; red only when it destroys. Every icon the app draws is named here, by what it
 * means, so the same thing wears the same glyph in the icon bar, a sidebar, a block head, a
 * search result and a timeline; nothing else imports `lucide-react` (the lint).
 *
 * The board's full table, added here as each screen lands (knip holds this file to what is used):
 *   kinds    task square-check-big · meeting calendar-clock · person user-round · reading
 *            book-open (a link: link) · project folder (the inbox: inbox) · organisation
 *            building-2 · communication messages-square · note sticky-note · birthday cake
 *   places   workbench layout-dashboard · today sun · calendar calendar-days · review history ·
 *            search search · keys keyboard · account circle-user-round
 *   fields   email mail · phone phone · link link · hometown house · lives in map-pin-house ·
 *            place map-pin · time zone globe · repeats repeat · duration clock · family heart ·
 *            friends users-round · work briefcase
 *   actions  new plus · edit pencil · open beside panel-right · open link external-link · tree
 *            list-tree · board square-kanban · filter list-filter · drag grip-vertical · archive
 *            archive · more ellipsis · delete trash-2 (red) · close x
 *   status   backlog circle-dashed · to do circle · in progress a half-filled ring (not in
 *            Lucide; drawn by hand) · done circle-check · cancelled circle-x
 *   time     flag; waiting on another task: lock
 */
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react'

export const NewIcon = Plus
export const CloseIcon = X
export const ExpandIcon = ChevronDown
export const CollapseIcon = ChevronRight
