import { type BirthdayListRow, idFrom, personId } from '@ctws/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BirthdayRow } from './BirthdayRow'

const row = (over: Partial<BirthdayListRow> = {}): BirthdayListRow => ({
  personId: idFrom(personId, '00000000-0000-0000-0000-000000000001'),
  name: '周楠',
  circle: null,
  day: '2026-10-12',
  inDays: 2,
  turns: 35,
  lunarDate: '农历九月初三',
  kept: [],
  timeZone: 'Europe/London',
  ...over,
})

const render = (r: BirthdayListRow) =>
  renderToStaticMarkup(
    // The thread asks for the projects' colours; nothing is fetched in a static render.
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BirthdayRow row={r} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('BirthdayRow', () => {
  it('says the name, the age, the date and how far off it is', () => {
    const html = render(row())
    expect(html).toContain('周楠')
    expect(html).toContain('turns 35')
    expect(html).toContain('Oct 12')
    expect(html).toContain('in 2 days')
  })

  it('shows the lunar date for a lunar birthday and not for a solar one', () => {
    expect(render(row())).toContain('农历九月初三')
    expect(render(row({ lunarDate: null }))).not.toContain('农历')
  })

  it('says the year is unknown instead of an age when there is no year', () => {
    const html = render(row({ turns: null }))
    expect(html).not.toContain('turns')
    expect(html).toContain('year unknown')
  })

  // The full explanation is on the person's page.
  it('says when the day was moved', () => {
    expect(render(row({ kept: ['short-month'] }))).toContain('moved')
    expect(render(row({ kept: [] }))).not.toContain('moved')
  })

  it('puts only the month and day in the margin, beside a cake', () => {
    // No year even when it falls next year: the next one is always within a year.
    const html = render(row({ day: '2027-01-05' }))
    expect(html).toContain('Jan 5')
    expect(html).not.toContain('2027</time>')
    expect(html).toContain('data-cake')
  })

  it("gives today's birthday the bold deadline colour and the rest a muted one", () => {
    expect(render(row({ inDays: 0 }))).toContain('text-warn-t')
    expect(render(row({ inDays: 2 }))).not.toContain('text-warn-t')
  })

  it('names the circle in English, since it is an enum and not text a person wrote', () => {
    expect(render(row({ circle: 'friend' }))).toContain('Friends')
    expect(render(row({ circle: null }))).not.toContain('Friends')
  })

  it("links to the person's own page", () => {
    expect(render(row())).toContain('href="/people/00000000-0000-0000-0000-000000000001"')
  })
})
