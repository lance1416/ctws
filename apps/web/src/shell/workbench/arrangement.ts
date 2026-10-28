import type { CSSProperties } from 'react'
import type { WorkbenchPlace } from '../contract'

/** Every place on the workbench: the modules' and the shell's own (FR-076, FR-077). */
export type Place = WorkbenchPlace | 'launcher' | 'week' | 'quickNote' | 'weather' | 'music'

/** How many columns and rows each place takes: Now 2×2, the wide ones 2×1, the rest one cell. */
const SIZE: Record<Place, { across: 1 | 2; down: 1 | 2 }> = {
  now: { across: 2, down: 2 },
  launcher: { across: 2, down: 1 },
  week: { across: 2, down: 1 },
  quickNote: { across: 2, down: 2 },
  meetings: { across: 1, down: 1 },
  awaiting: { across: 1, down: 1 },
  birthdays: { across: 1, down: 1 },
  reading: { across: 1, down: 1 },
  weather: { across: 1, down: 1 },
  music: { across: 1, down: 1 },
}

/** The 1440 screen's order (artboard 22): any other width but six columns fills in it. */
const ORDER: readonly Place[] = [
  'now',
  'meetings',
  'awaiting',
  'launcher',
  'birthdays',
  'week',
  'reading',
  'quickNote',
  'weather',
  'music',
]

/** Six columns (artboard 10): column and row of each place's first cell. */
const AT_SIX: Record<Place, [number, number]> = {
  now: [1, 1],
  week: [1, 3],
  launcher: [3, 1],
  quickNote: [3, 2],
  meetings: [5, 1],
  awaiting: [5, 2],
  birthdays: [5, 3],
  weather: [6, 1],
  music: [6, 2],
  reading: [6, 3],
}

/** Not built yet (FR-077): not on a phone (FR-088). */
const LATER: readonly Place[] = ['quickNote', 'weather', 'music']

/** Below this a row would not hold a widget's head and its first rows (DES-001 section 4). */
const ROW_PX = 236
/** The six-column screen's last row, for the short ones (artboard 10). */
const LAST_ROW_PX = 212
const GAP_PX = 12

/**
 * THE WORKBENCH'S ARRANGEMENT (FR-078, DES-001 section 4): the places in order, each with where
 * it goes, and the grid they go in. Six columns is artboard 10: three rows sharing the screen,
 * the first two at least a row's height. From two to five, the places fill in the 1440 screen's
 * order, rows of 236 and the page scrolls (artboard 22). One column is a phone's: each as tall as
 * what it holds, and only what is built.
 */
export function arrangement(columns: number): {
  grid: CSSProperties
  places: { place: Place; style: CSSProperties }[]
} {
  if (columns <= 1)
    return {
      grid: { gridTemplateColumns: 'minmax(0, 1fr)' },
      places: ORDER.filter((p) => !LATER.includes(p)).map((place) => ({ place, style: {} })),
    }
  if (columns >= 6)
    return {
      grid: {
        gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
        gridTemplateRows: `minmax(${ROW_PX}px, 1fr) minmax(${ROW_PX}px, 1fr) ${LAST_ROW_PX}px`,
        minHeight: ROW_PX * 2 + LAST_ROW_PX + GAP_PX * 2,
      },
      places: ORDER.map((place) => {
        const [column, row] = AT_SIX[place]
        const { across, down } = SIZE[place]
        return {
          place,
          style: { gridColumn: `${column} / span ${across}`, gridRow: `${row} / span ${down}` },
        }
      }),
    }
  return {
    grid: {
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gridAutoRows: `${ROW_PX}px`,
      gridAutoFlow: 'row dense',
    },
    places: ORDER.map((place) => {
      const { across, down } = SIZE[place]
      return { place, style: { gridColumn: `span ${across}`, gridRow: `span ${down}` } }
    }),
  }
}
