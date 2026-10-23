/** A role someone held at an organisation, by the month it began and the month it ended. */
export type Tenure = { personId: string; from: string | null; to: string | null }

/** Whether `day` (`YYYY-MM-DD`) falls in a tenure: both the first and the last month count whole. */
export const heldOn = (t: Tenure, day: string): boolean =>
  (t.from === null || t.from.slice(0, 7) <= day.slice(0, 7)) &&
  (t.to === null || day.slice(0, 7) <= t.to.slice(0, 7))
