/** "London, United Kingdom": a stored place without its region, as artboard 5 says it (M-05). */
export function cityAndCountry(label: string): string {
  const parts = label.split(', ')
  return parts.length > 2 ? `${parts[0]}, ${parts.at(-1)}` : label
}
