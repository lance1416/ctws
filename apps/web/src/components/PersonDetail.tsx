import { channelProblem, type ChannelKind, type PersonResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { channelHref, deletePerson, patchPerson, type BirthdayDraft } from '../api/people'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { DangerAction, DangerZone } from './DangerZone'
import { useEffect, useState, type ReactNode } from 'react'
import { BirthdayEditor, BirthdayFields, givenDate, plainDate } from './BirthdayFields'
import { CIRCLE_LABELS } from './BirthdayRow'
import { BUTTON } from './buttonStyles'
import { byKind, channelLabel, channelPlaceholder, KIND_CHOICES, KIND_LABEL } from '../channels'
import { usePhone } from '../usePhone'
import { Field } from './Field'
import { PickCity } from './PickCity'
import { useComposing } from '../composition'
import { boxed, CHIP, field, label } from './formStyles'
import { NoteBody } from '../notes/NoteBody'
import { WritingMode } from '../notes/WritingMode'
import { DetailHead, DetailPane } from './DetailPane'
import { Link } from 'react-router-dom'
import { LinkedSection } from './Links'
import { PickMany, PickOne } from './inline'
import { useRecordRecent } from '../recent'

/**
 * ONE PERSON, in the shell's detail pane.
 *
 * NOTHING HERE HAS A SAVE, as nowhere else in the pane does: a company name is typed and
 * committed on leaving the field, a project is added and written, an address is edited and
 * written. A person is not edited differently from a task.
 */

/**
 * The pane: this module's fields inside the shell's frame.
 *
 * The FIELDS are a component of their own because the person's own page shows the same ones with
 * no frame around them (`relations.Head`). One editor, two places -- a second copy drifts.
 */
export function PersonDetail({ person, onClose }: { person: PersonResponse; onClose: () => void }) {
  useRecordRecent({
    type: 'person',
    id: person.id,
    title: person.name,
    to: `/people/${person.id}`,
    kind: 'Person',
  })
  return (
    <DetailPane label="People" onClose={onClose}>
      <PersonFields person={person} onClose={onClose} />
      {/* Linked -- the meetings they are in, what they recommended, the task that came out of a
          call. None of it is written on the person: the edges are, and this reads them from the
          other end. The edges are the SHELL's, so they sit BESIDE this module's fields rather
          than inside them -- the person's own page composes the same two halves. */}
      <LinkedSection of={{ type: 'person', id: person.id }} className="mt-4" />

      {/*
        最后一个东西，底下再没有别的控件。

        一个人没有自己的页了（这一层就是 `/people/<id>`），所以删除没有别处可放。它排在
        Linked 之后、要滚到底才看得见，按下去还先问一次 —— 距离加一次确认，是这里能给的全部。
      */}
      <DangerZone>
        <DeletePerson person={person} onDeleted={onClose} />
      </DangerZone>
    </DetailPane>
  )
}

export function PersonFields({
  person,
  onClose,
}: {
  person: PersonResponse
  /** Where to go when this person is deleted. Not every surface has somewhere to close TO. */
  onClose?: () => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  // 号码分组那一包：读的时候也要，不然同一个号码在列表里排好了而在这里挤成一条。
  const phone = usePhone()
  const [writing, setWriting] = useState(false)
  const rail = useProjectRail()
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  // 项目是一条边：改了它，读边的那一块（Linked）也要跟着重读，否则刚去掉的那条线还在下面挂着。
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['people'] })
    void qc.invalidateQueries({ queryKey: ['links'] })
  }
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchPerson>[1]) => patchPerson(person.id, patch),
    onSettled: refresh,
  })

  const chip = (id: string) => (
    <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />
  )

  const head = (
    <div>
      {onClose && (
        <DetailHead
          // 回列表。没有第二个地方可去了：这一层就是这个人的地址。
          kind={
            <Link
              to="/people"
              className="rounded text-sm text-fg-muted hover:text-fg hover:underline"
            >
              ← People
            </Link>
          }
          onClose={onClose}
        />
      )}
    </div>
  )

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        {head}
        <PersonForm
          person={person}
          projects={projects.data ?? []}
          chip={chip}
          busy={save.isPending}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            save.mutate(patch)
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {head}

      {/*
        读的时候就只是读：每个值都是文字，整块里只有一个 Edit 可以按。

        以前每个字段自己是一个看不出来的按钮 —— 知道的人用得飞快，不知道的人以为这一页不能改。
        任务面板早就是「阅读态 / 编辑态」两段（`TaskDetail`），Apple 和 Google 的联系人也是
        （Edit → Done / 铅笔 → Save）。这里跟上。
      */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-fg">{person.name}</h2>
          {(person.title || person.org) && (
            <p className="truncate text-sm text-fg-muted">
              {[person.title, person.org].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {person.circle && (
          <span className="shrink-0 rounded-full border border-border-subtle bg-surface-raised px-2.5 py-1 text-xs text-fg-muted">
            {CIRCLE_LABELS[person.circle]}
          </span>
        )}
        <button type="button" className={BUTTON.secondary} onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      {/* 先是怎么找到这个人：一张联系人页存在的理由就是这个。 */}
      {person.channels.length > 0 && (
        <Field label="Person" shape="above">
          <ul data-channels className="flex flex-col gap-0.5">
            {byKind(person.channels).map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                <span className="w-12 shrink-0 text-xs text-fg-muted">{KIND_LABEL[c.kind]}</span>
                <a
                  href={channelHref(c.kind, c.value)!}
                  // 电话用等宽数字：一串号码是用来读和对的，不是一句话。
                  className={`min-w-0 flex-1 truncate text-sm text-accent hover:underline ${
                    c.kind === 'phone' ? 'tabular-nums' : ''
                  }`}
                >
                  {channelLabel(c.kind, c.value, phone?.displayPhone)}
                </a>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {/*
        其余字段，标签在值上面，一格一件事。列数看这一块自己有多宽（`@container`，不是 `sm:`）：
        同一块东西要在 350px 的那一层里和在窄窗口上各渲染一次，窗口宽不代表这里宽。
      */}
      <div className="@container">
        <div
          data-person-fields
          className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3"
        >
          <BirthdayFields person={person} />
          <Reads label="Hometown" value={person.hometown} />
          <Reads label="Lives in" value={person.city} />
          <Reads label="Company" value={person.org} />
          <Reads label="Title" value={person.title} />
          <Reads
            label="Gender"
            value={person.gender ? (GENDER_LABELS[person.gender] ?? null) : null}
          />
          <Reads label="Circle" value={person.circle ? CIRCLE_LABELS[person.circle] : null} />
          <Field label="Projects" shape="above">
            {person.projects.length === 0 ? (
              <p className="text-sm text-fg-subtle">Not on any project</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {person.projects.map((p) => (
                  <li key={p.id} className={CHIP}>
                    {chip(p.id)}
                    <span className="truncate">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      </div>

      {/*
        备注，和任务备注同一条 Markdown 管线，连 68ch 的阅读行宽都一样。

        改它不必先进整张表：`Edit notes` 直接开写作层 —— 一句想起来就记下的话，不该先经过一张
        关于这个人的表格。
      */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-fg-muted">Notes</span>
          <button type="button" className={BUTTON.secondary} onClick={() => setWriting(true)}>
            Edit notes
          </button>
        </div>
        <div data-person-notes className="mt-1.5 max-w-[68ch] text-fg">
          {person.note ? (
            <NoteBody source={person.note} />
          ) : (
            <p className="text-sm text-fg-subtle">No notes yet</p>
          )}
        </div>
      </div>
      {writing && (
        <WritingMode
          heading={person.name}
          source={person.note ?? ''}
          onChange={(next) => save.mutate({ note: next.trim() === '' ? null : next })}
          onClose={() => setWriting(false)}
        />
      )}
    </div>
  )
}

/** 性别读出来的样子。值是契约的枚举，屏幕上的词在这里，和 circle 一样。 */
const GENDER_LABELS: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
}

/** 表里的一个短字段：标签在上，输入框在下。 */
function Writes({
  label: text,
  id,
  value,
  onChange,
}: {
  label: string
  id: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} mt-1 text-sm`}
      />
    </div>
  )
}

/** 一个只读的字段：没有值就说 Not set，和别的空格长得一样。 */
function Reads({ label, value }: { label: string; value: string | null }) {
  return (
    <Field label={label} shape="above">
      <p className={`truncate text-sm ${value ? 'text-fg' : 'text-fg-subtle'}`}>
        {value || 'Not set'}
      </p>
    </Field>
  )
}

/**
 * 表里的一行联系方式。
 *
 * `touched`：这一行被离开过 —— 还在打字的那一行不挑错。
 * `seed`：框里那个国家码是这张表自己放进去的，不是人写的。人没在它后面接着打，这一行就还是
 * 空的 —— 加了一行又改主意是常事，不该因此按不动 Save。
 */
type Row = PersonResponse['channels'][number] & { touched?: boolean; seed?: string }

/** 这一行上有人写过东西吗？自己放的那个国家码不算。 */
const written = (c: Row) => c.value.trim() !== '' && c.value !== c.seed

/**
 * 改这个人：一张表，一次保存。
 *
 * 每个值都长成一个输入框，不用猜哪里能点；改完按 Save 一次写回，Cancel 当没发生过。只有两样
 * 不在这张表里，各有各的理由：**生日**自己有一套控件（历法、年月日、时辰、提前量），塞进来会
 * 把表撑回原来那副样子，所以它仍然是那一格加一个二级面板；**Linked** 是边，加一条边当场就成立，
 * 不该等一个它不属于的表单 —— 任务那边的依赖也是这条规矩。
 */
function PersonForm({
  person,
  projects,
  chip,
  busy,
  onCancel,
  onSave,
}: {
  person: PersonResponse
  projects: { id: string; name: string; archivedAt: string | null }[]
  chip: (id: string) => ReactNode
  busy: boolean
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchPerson>[1]) => void
}) {
  const [name, setName] = useState(person.name)
  const [org, setOrg] = useState(person.org ?? '')
  const [title, setTitle] = useState(person.title ?? '')
  const [hometown, setHometown] = useState(person.hometown ?? '')
  const [city, setCity] = useState(person.city ?? '')
  const [gender, setGender] = useState(person.gender ?? '')
  const [circle, setCircle] = useState(person.circle ?? '')
  const [projectIds, setProjectIds] = useState(person.projects.map((p) => p.id))
  const [channels, setChannels] = useState<Row[]>(() => byKind(person.channels))
  const phone = usePhone()
  const region = phone?.currentRegion()
  /**
   * 号码那一包到了之后，把这张表里的电话过一遍。
   *
   * 写了字的：补上国家码再排好。存下来的老号码可能是 `(730) 197-4443`，而现在没有国家码的号码
   * 过不了校验 —— 不补的话，改他的名字也会被一个他从没打开过的框卡住。
   *
   * 空着的：放上本地的国家码。这件事挑号码那一下也做，两处都要：那一包有八十来 KB，而一个人
   * 完全可能在它到达之前就把那一行改成了电话 —— 先挑的那一下没有国家码可放，这里补上。
   */
  useEffect(() => {
    if (!phone) return
    const code = phone.callingCodeFor(region) ?? ''
    setChannels((rows) =>
      rows.map((row) =>
        row.kind !== 'phone'
          ? row
          : row.value.trim() === ''
            ? { ...row, value: code, seed: code }
            : { ...row, value: phone.formatPhone(phone.toE164(row.value, region), region) },
      ),
    )
  }, [phone, region])
  /** 又打了一个字之后这个框里该是什么：电话跟着排，别的原样。 */
  const typed = (kind: ChannelKind, was: string, now: string) =>
    kind === 'phone' && phone ? phone.retype(was, now, region) : now
  /** 空的电话框里先放上本地的国家码：它是必填的，而一个空框不会说这件事。 */
  const seed = phone?.callingCodeFor(region) ?? ''
  /**
   * 这一行换了类型之后是什么样。
   *
   * 自己放进去的那个国家码跟着类型走 —— 它不是人写的东西，所以改成 Email 时它要消失，而不是
   * 留在那儿变成一个过不了校验的邮箱地址。
   */
  /** 改这一行。走 updater 而不是闭包里那份 `channels`：一行里有三个处理器各自改它。 */
  const edit = (at: number, change: (row: Row) => Row) =>
    setChannels((rows) => rows.map((row, i) => (i === at ? change(row) : row)))

  const switched = (row: Row, kind: ChannelKind): Row => {
    const value = row.value === row.seed ? '' : row.value
    if (kind !== 'phone') return { kind, label: row.label, value }
    if (value.trim() === '') return { kind, label: row.label, value: seed, seed }
    return { kind, label: row.label, value: typed(kind, value, value) }
  }
  /**
   * 这一行哪里不成立。
   *
   * 两道：写法（契约那套，服务端同一份）和长度（这个国家的号码到底有多长，要那一包元数据才
   * 知道）。空行不算问题 —— 加了一行又改主意，不该因此按不动 Save。
   */
  const problems = channels.map((c) =>
    !written(c)
      ? undefined
      : (channelProblem(c.kind, c.value) ??
        (c.kind === 'phone' ? (phone?.phoneProblem(c.value) ?? undefined) : undefined) ??
        undefined),
  )
  const badChannel = problems.some((p) => p !== undefined)
  // 说出来的只有离开过的那几行。Save 按不按得动看的是全部 —— 挡住一次必然的 400，和当着人的面
  // 数落他还没打完的字，是两件事。
  const shown = problems.map((p, i) => (channels[i]?.touched ? p : undefined))
  const [note, setNote] = useState(person.note ?? '')
  const [writing, setWriting] = useState(false)
  const [pickingDay, setPickingDay] = useState(false)
  // 没点开就是不动它：undefined 表示「这次没改生日」，null 表示「去掉」。
  const [birthday, setBirthday] = useState<BirthdayDraft | null | undefined>(undefined)
  // 服务端说这个日子不存在：保存必然 400，所以按钮关着。
  const [badDay, setBadDay] = useState(false)
  const composing = useComposing()
  // What the button says. Untouched (`undefined`), it is the birthday already saved -- it used to
  // say `Not set` here for a person whose pane, one press earlier, read `Oct 17, 1991`.
  const dayText =
    birthday === undefined
      ? person.birthday
        ? givenDate(person.birthday)
        : null
      : birthday
        ? plainDate(birthday)
        : null

  const submit = () => {
    if (busy || badDay || badChannel || name.trim() === '') return
    onSave({
      name: name.trim(),
      org: org.trim() || null,
      title: title.trim() || null,
      hometown: hometown.trim() || null,
      city: city.trim() || null,
      gender: (gender || null) as 'male' | null,
      circle: (circle || null) as 'family' | null,
      projectIds,
      // 空地址当没写：一行填了一半的联系方式不是一条联系方式。
      channels: byKind(channels)
        .filter(written)
        .map((c) => ({
          kind: c.kind,
          // 电话存成 E.164：没有空格的那一串，全世界只有一个读法。屏幕上的分组由它算出来，所以
          // 这个人在列表、在这一层、在以后任何一处，看到的都是同一个样子。
          value: c.kind === 'phone' && phone ? phone.toE164(c.value, region) : c.value.trim(),
          label: c.label?.trim() || null,
        })),
      note: note.trim() || null,
      ...(birthday === undefined ? {} : { birthday }),
    })
  }

  return (
    <form
      aria-label="Edit person"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      {...composing.bind}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-fg-muted">Editing</span>
        <button type="button" className={BUTTON.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={BUTTON.primary}
          disabled={busy || badDay || badChannel || name.trim() === ''}
        >
          Save
        </button>
      </div>

      <div>
        <label htmlFor="c-name" className={label}>
          Name
        </label>
        <input
          id="c-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </div>

      <div>
        <span className={label}>Person</span>
        <ul className="mt-1.5 flex flex-col gap-2">
          {channels.map((c, i) => (
            <li key={i} className="flex min-w-0 flex-wrap items-center gap-1.5">
              <PickOne
                label={`Type of item ${i + 1}`}
                value={c.kind}
                choices={KIND_CHOICES}
                onPick={(kind) => edit(i, (row) => switched(row, kind))}
              />
              <input
                aria-label={`Item ${i + 1}`}
                value={c.value}
                // 这一类长什么样，而不是一句「待填」—— 占位符不会被存成内容。
                placeholder={channelPlaceholder(c.kind)}
                type={c.kind === 'phone' ? 'tel' : 'text'}
                inputMode={c.kind === 'phone' ? 'tel' : 'text'}
                aria-invalid={shown[i] !== undefined}
                onChange={(e) => {
                  const now = e.target.value
                  // 又开始打了，红字就收回去：改对了要当场看得见，而不是等再离开一次。
                  edit(i, (row) => ({
                    ...row,
                    value: typed(row.kind, row.value, now),
                    touched: false,
                  }))
                }}
                // 离开这一行才挑错。一个人打到 `+44` 的时候那还不是一个号码，而红字说的是
                // 「你写错了」—— 没写完不是写错了。
                onBlur={() => edit(i, (row) => ({ ...row, touched: true }))}
                className={`${boxed} min-w-0 flex-1 text-sm ${c.kind === 'phone' ? 'tabular-nums' : ''}`}
              />
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => setChannels((rows) => rows.filter((_, at) => at !== i))}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {/* 保存之前就说清是哪一条不成立：按下 Save 才被服务端拒，中间那段路是白走的。 */}
              {shown[i] !== undefined && <p className="w-full text-xs text-danger">{shown[i]}</p>}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setChannels((rows) => [...rows, { kind: 'email', value: '', label: null }])
          }
          className="mt-1.5 flex h-8 items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
            <path
              d="M8 3.5v9M3.5 8h9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Add one
        </button>
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          {/*
            生日也在这张表里，跟着这一次 Save 一起写回。

            它比别的字段胖（历法、年、月、日、闰月、时辰、提前量），所以收着：点一下才摊开那一排
            控件。摊开的那一块横跨整行 —— 挤在三分之一列里，那排控件会折成四行。
          */}
          <Field label="Birthday" shape="above">
            <button
              type="button"
              aria-expanded={pickingDay}
              // 自己的名字：屏幕上写的是 `Not set`，而性别和 circle 空着时也写 `Not set`。
              aria-label={dayText ? `Birthday, ${dayText}` : 'Birthday, not set'}
              onClick={() => setPickingDay(!pickingDay)}
              className={`-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left text-sm hover:bg-surface-hover ${
                dayText ? 'text-fg' : 'text-fg-subtle'
              }`}
            >
              <span className="truncate">{dayText ?? 'Not set'}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3 w-3 shrink-0 text-fg-subtle"
              >
                <path
                  d="M4 6.5l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </Field>
          {pickingDay && (
            <div className="col-span-full rounded-lg border border-border-strong bg-surface-raised p-3">
              <BirthdayEditor
                birthday={person.birthday}
                onChange={(draft, refused) => {
                  setBirthday(draft)
                  setBadDay(refused)
                }}
              />
              {person.birthday && (
                <button
                  type="button"
                  className={`mt-2 ${BUTTON.quiet}`}
                  onClick={() => {
                    setBirthday(null)
                    setBadDay(false)
                    setPickingDay(false)
                  }}
                >
                  Remove the birthday
                </button>
              )}
            </div>
          )}
          {/* 城市级：选中之后存的是一个标准写法，所以两个人的「现居」不会一个 Oxford 一个 oxford, uk。 */}
          <PickCity label="Hometown" id="c-home" value={hometown} onChange={setHometown} />
          <PickCity label="Lives in" id="c-city" value={city} onChange={setCity} />
          <Writes label="Company" id="c-org" value={org} onChange={setOrg} />
          <Writes label="Title" id="c-title" value={title} onChange={setTitle} />
          <Field label="Gender" shape="above">
            <PickOne
              label="Gender"
              value={gender}
              choices={[
                { value: '', label: 'Not set' },
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
                { value: 'other', label: 'Other' },
              ]}
              onPick={setGender}
            />
          </Field>
          <Field label="Circle" shape="above">
            <PickOne
              label="Circle"
              value={circle}
              choices={[
                { value: '', label: 'Not set' },
                { value: 'family', label: 'Family' },
                { value: 'friend', label: 'Friends' },
                { value: 'work', label: 'Work' },
              ]}
              onPick={setCircle}
            />
          </Field>
          <Field label="Projects" shape="above">
            <PickMany
              label="Projects"
              chosen={projectIds.map((id) => ({
                value: id,
                label: projects.find((p) => p.id === id)?.name ?? '',
                mark: chip(id),
              }))}
              choices={projects
                .filter((p) => !p.archivedAt)
                .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) }))}
              onChange={setProjectIds}
              empty="Not on any project"
            />
          </Field>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <label htmlFor="c-note" className={`flex-1 ${label}`}>
            Notes
          </label>
          <button type="button" className={BUTTON.quiet} onClick={() => setWriting(true)}>
            Write in full
          </button>
        </div>
        <textarea
          id="c-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className={`${field} mt-1.5 max-w-[68ch]`}
        />
      </div>
      {writing && (
        <WritingMode
          heading={name || person.name}
          source={note}
          onChange={setNote}
          onClose={() => setWriting(false)}
        />
      )}
    </form>
  )
}

/**
 * DESTROYING THIS PERSON, for whichever surface is showing them.
 *
 * Exported on its own rather than drawn at the end of the fields above, because WHERE it goes is
 * the surface's to decide and it is the same answer every time: last, under a rule (`DangerZone`).
 * The fields are also shown on the object page, which has panels of its own below them -- a delete
 * drawn inside the fields would land in the middle of that page.
 */
export function DeletePerson({
  person,
  onDeleted,
}: {
  person: PersonResponse
  onDeleted?: () => void
}) {
  const qc = useQueryClient()
  const drop = useMutation({
    mutationFn: () => deletePerson(person.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['people'] })
      onDeleted?.()
    },
  })
  return (
    <DangerAction
      label="Delete person"
      confirmLabel="Confirm deleting this person"
      message={`Delete “${person.name}”? This cannot be undone.`}
      busy={drop.isPending}
      onConfirm={() => drop.mutate()}
    />
  )
}
