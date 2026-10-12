import {
  CHANNEL_KINDS,
  channelProblem,
  type ChannelKind,
  type ContactResponse,
} from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { createContact, type BirthdayDraft } from '../api/contacts'
import { listProjects } from '../api/projects'
import { useComposing } from '../composition'
import { channelPlaceholder } from '../channels'
import { useProjectRail } from '../projectColor'
import { usePhone } from '../usePhone'
import { BirthdayEditor, birthdayDraftOf } from './BirthdayFields'
import { boxed, field, label } from './formStyles'
import { PickMany, PickOne } from './inline'
import { DialogFooter } from './DialogFooter'
import { Modal } from './Modal'

/**
 * NEW CONTACT, filled in once.
 *
 * A name alone is never all you know about somebody. The line-of-text box this stands beside is
 * right for the moment you only have a name -- and wrong every other time, because it then makes
 * you create the person and open them again to say anything else. Both ways in stay: the box for
 * a name, this for a person.
 */
const KIND_LABEL: Record<ChannelKind, string> = { email: 'Email', phone: 'Phone', url: 'Link' }

export function NewContactDialog({
  onClose,
  onMade,
}: {
  onClose: () => void
  onMade: (made: ContactResponse) => void
}) {
  const qc = useQueryClient()
  const nameField = useRef<HTMLInputElement>(null)
  const composing = useComposing()
  const rail = useProjectRail()

  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<ChannelKind>('email')
  const [address, setAddress] = useState('')
  const [left, setLeft] = useState(false)
  // 框里那个国家码是这张表自己放的。人没在它后面接着打，这一格就还是空的。
  const [seed, setSeed] = useState('')
  /**
   * 这里也排号码。
   *
   * 以前只有联系人那一层的表排，于是从这个对话框写下的号码存成了打字时的那一串，在任何地方都
   * 挤成一条 —— 同一个号码长什么样，取决于它当初是从哪个框进来的。现在两边同一套：排给人看，
   * 存成 E.164。
   */
  const phone = usePhone()
  const region = phone?.currentRegion()
  /**
   * 选了 Phone 而框还空着，就放上本地的国家码。
   *
   * 放在 effect 里而不是挑类型那一下：那一包有八十来 KB，一个人完全可能在它到达之前就选了
   * Phone —— 那一下没有国家码可放。这里 `phone` 和 `kind` 哪个后到都补得上。
   */
  useEffect(() => {
    if (!phone || kind !== 'phone') return
    const code = phone.callingCodeFor(region) ?? ''
    setSeed(code)
    setAddress((a) => (a.trim() === '' ? code : a))
  }, [phone, region, kind])
  const wrote = address.trim() !== '' && address !== seed
  const problem = !wrote
    ? null
    : (channelProblem(kind, address) ??
      (kind === 'phone' ? (phone?.phoneProblem(address) ?? null) : null))
  const [projectIds, setProjects] = useState<string[]>([])
  const [circle, setCircle] = useState('')
  /**
   * 不摊开，直到有人说有。
   *
   * 写下一个人常常只有一个名字，一张摊开的空日期表单读起来像坏数据——他的页面上也是这条规则
   * （没有生日时那里是一个「Add a birthday」，不是一行空字段）。
   */
  const [birthday, setBirthday] = useState<{ draft: BirthdayDraft; refused: boolean } | null>(null)

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const make = useMutation({
    mutationFn: createContact,
    onSuccess: async (made) => {
      await qc.invalidateQueries({ queryKey: ['contacts'] })
      onMade(made)
    },
  })

  // 服务端已经说这个日子不存在了，Create 按下去只会 400，而这个对话框不画那条错误。
  const ready = name.trim().length > 0 && !birthday?.refused && problem === null
  const submit = () => {
    if (!ready || make.isPending) return
    make.mutate({
      name: name.trim(),
      ...(org.trim() ? { org: org.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(projectIds.length > 0 ? { projectIds } : {}),
      ...(wrote
        ? {
            channels: [
              {
                kind,
                value: kind === 'phone' && phone ? phone.toE164(address, region) : address.trim(),
                label: null,
              },
            ],
          }
        : {}),
      ...(circle ? { circle: circle as 'family' } : {}),
      ...(birthday ? { birthday: birthday.draft } : {}),
    })
  }

  return (
    <Modal
      title="New contact"
      onClose={onClose}
      initialFocus={nameField}
      dismissLabel={null}
      className="rounded-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        {...composing.bind}
        className="flex flex-col gap-5 px-5 py-4"
      >
        <div>
          <input
            ref={nameField}
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is this?"
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                submit()
              }
            }}
            className="w-full rounded-lg bg-transparent py-0.5 text-lg font-semibold text-fg"
          />
        </div>

        <div>
          <label htmlFor="contact-org" className={label}>
            Company
          </label>
          <input
            id="contact-org"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className={`${field} mt-1.5`}
          />
        </div>

        {/* 同一个编辑器，和他页面上那个是同一套规则：预览、闰月、以及服务端那句拒绝。 */}
        <div>
          <span className={label}>Birthday</span>
          <div className="mt-1.5">
            {birthday ? (
              <>
                <BirthdayEditor
                  birthday={null}
                  onChange={(draft, refused) => setBirthday({ draft, refused })}
                />
                <button
                  type="button"
                  onClick={() => setBirthday(null)}
                  className="mt-1 text-sm text-fg-muted hover:text-fg"
                >
                  Not now
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBirthday({ draft: birthdayDraftOf(null), refused: false })}
                className="h-9 rounded-lg border border-dashed border-border-strong px-3 text-sm text-fg-muted hover:border-border-strong hover:text-fg"
              >
                Add a birthday
              </button>
            )}
          </div>
        </div>

        {/* 谁是谁：列表按它分组，而且写下这个人的时候你就知道答案。 */}
        <div>
          <span className={label}>Circle</span>
          <div className="mt-1.5">
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
          </div>
        </div>

        {/* ONE address, because one is what you have when you are writing someone down. The rest
            are added on their page, where the list of them belongs. */}
        <div>
          <span className={label}>Contact</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {/* The app's own picker, not a native `<select>`: the OS draws that popup and
                does not know this palette -- on Windows it came up white with the page's
                light-grey text on it. */}
            <div className="flex min-w-[6.5rem] items-center">
              <PickOne
                label="Kind"
                value={kind}
                choices={CHANNEL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                onPick={(next) => {
                  setKind(next)
                  // 自己放进去的那个国家码跟着类型走：它不是人写的东西，改成 Email 之后它留在
                  // 那儿就成了一个过不了校验的邮箱地址。
                  if (next !== 'phone' && address === seed) setAddress('')
                }}
              />
            </div>
            <input
              aria-label="Address"
              value={address}
              placeholder={channelPlaceholder(kind)}
              type={kind === 'phone' ? 'tel' : 'text'}
              inputMode={kind === 'phone' ? 'tel' : 'text'}
              aria-invalid={left && problem !== null}
              onChange={(e) => {
                const now = e.target.value
                // updater 而不是闭包里那个 `address`：`retype` 要的就是「上一次是什么」。
                setAddress((was) =>
                  kind === 'phone' && phone ? phone.retype(was, now, region) : now,
                )
                // 又开始打了，红字就收回去：改对了要当场看得见。
                setLeft(false)
              }}
              // 离开这个框才挑错：打到 `+44` 还不是一个号码，而红字说的是「你写错了」。
              onBlur={() => setLeft(true)}
              className={`min-w-[12rem] flex-1 ${boxed} ${kind === 'phone' ? 'tabular-nums' : ''}`}
            />
          </div>
          {left && problem !== null && <p className="mt-1.5 text-xs text-danger">{problem}</p>}
        </div>

        <div>
          <span className={label}>Projects</span>
          <div className="mt-1.5">
            <PickMany
              label="Projects"
              chosen={projectIds.map((id) => ({
                value: id,
                label: projects.data?.find((p) => p.id === id)?.name ?? '',
                mark: <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />,
              }))}
              choices={(projects.data ?? [])
                .filter((p) => !p.archivedAt)
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  mark: <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(p.id)}`} />,
                }))}
              onChange={setProjects}
              empty="Not on any project"
            />
          </div>
        </div>

        <div>
          <label htmlFor="contact-note" className={label}>
            Notes
          </label>
          <textarea
            id="contact-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className={`${field} mt-1.5`}
          />
        </div>

        <DialogFooter
          submit="Create"
          error={make.error}
          busy={make.isPending}
          disabled={!ready}
          onCancel={onClose}
        />
      </form>
    </Modal>
  )
}
