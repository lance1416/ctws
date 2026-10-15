import type { City } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { citiesQuery } from './api'
import { useComposing } from '../../platform/keyboard/composition'
import { field } from '../../platform/ui/formStyles'

/**
 * 一个城市。
 *
 * 打字找城市，选中之后存下来的是一个标准写法（`Oxford, England, United Kingdom`）—— 所以两个
 * 人的「现居」不会一个写 Oxford 一个写 oxford, uk。表在服务端（一万五千人以上的三万四千个城市，
 * 打进镜像），打三个字母才去问一次。
 *
 * 认不出来也存得下：世界上有的是不到一万五千人的地方，而这是一个人自己的通讯录 —— 挡住他写
 * 「外婆家那个镇」不是校验，是添堵。认不出来的时候只说一句，不拦着。
 *
 * 用 `<input list>` 那套原生 datalist 不行：它在 Windows 上由系统画，不认这套配色，和原生
 * `<select>` 被挡下的理由一样（`layers.test.ts`）。所以这里是一个自己画的候选列表。
 */
export function PickCity({
  label,
  id,
  value,
  onChange,
}: {
  label: string
  id: string
  value: string
  onChange: (next: string) => void
}) {
  const [typing, setTyping] = useState(false)
  const composing = useComposing()
  const listId = useId()

  const hits = useQuery({
    ...citiesQuery(value),
    enabled: typing && value.trim().length >= 3,
  })

  const cities = hits.data ?? []
  const exact = cities.some((c) => c.label === value)
  // The list, and what the box says about it, are one condition.
  const listed = typing && cities.length > 0 && !exact
  const unknown = typing && value.trim().length >= 3 && hits.isSuccess && cities.length === 0

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={listed}
        aria-controls={listId}
        {...composing.bind}
        onChange={(e) => {
          setTyping(true)
          onChange(e.target.value)
        }}
        onBlur={() => {
          // 候选列表上的点击先发生在 blur 之后，所以晚一拍再收起来。
          window.setTimeout(() => setTyping(false), 120)
        }}
        className={`${field} text-sm`}
      />

      {listed && (
        <ul
          id={listId}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] bg-float py-1 shadow-float"
        >
          {cities.map((c: City) => (
            <li key={c.label}>
              <button
                type="button"
                // onMouseDown：click 发生在 blur 之后，那时列表已经在收起来了。
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(c.label)
                  setTyping(false)
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm text-ink hover:bg-hover"
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {unknown && (
        <p className="mt-1 text-xs text-ink-muted">
          No city by that name. It will be saved as written.
        </p>
      )}
    </div>
  )
}
