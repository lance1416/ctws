/** Where a row is taken to be dragged: two columns of three dots (artboards 8, 29). */
export function Grip() {
  return (
    <svg viewBox="0 0 6 12" width="6" height="12" aria-hidden="true" fill="currentColor">
      {[1.5, 4.5].flatMap((x) =>
        [2, 6, 10].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.9" />),
      )}
    </svg>
  )
}
