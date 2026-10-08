import { and, eq, inArray, isNull } from 'drizzle-orm'
import { meetings } from '../db/schema'
import type { Linkable } from '../links/linkable'

/** 会议 names its own meetings for the shell. See `links/linkable.ts` for why this exists. */
export const meetingLinkable: Linkable = {
  type: 'meeting',
  label: '会议',
  name: async (q, workspaceId, ids) => {
    const rows = await q
      .select({
        id: meetings.id,
        title: meetings.title,
        startsLocal: meetings.startsLocal,
        timeZone: meetings.timeZone,
      })
      .from(meetings)
      .where(
        and(
          eq(meetings.workspaceId, workspaceId),
          isNull(meetings.deletedAt),
          inArray(meetings.id, [...ids]),
        ),
      )
    return new Map(
      rows.map((r) => [
        r.id,
        // The SERIES' own start, not an occurrence: an edge is to the series, and which occurrence
        // a reader means is a question only the meeting's own page can answer.
        { title: r.title, detail: `${r.startsLocal.replace('T', ' ')} · ${r.timeZone}` },
      ]),
    )
  },
}
