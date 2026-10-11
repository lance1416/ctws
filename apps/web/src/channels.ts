import { CHANNEL_KINDS, type ChannelKind, type ContactChannel } from '@ctws/contracts'
import { linkLabel } from './url'

/**
 * 一个人的三种地址：怎么排、怎么写、空着时提示什么。
 *
 * 它们是三种不同的结构化文本，不是三段随便什么字 —— 值本身合不合规由契约说（`channelProblem`，
 * 服务端同一套），这里管的是看到的样子。
 */

/** 归堆的次序，就是 `CHANNEL_KINDS` 的次序：先两种能直接找到人的，再是网上的那个。 */
const ORDER = new Map<ChannelKind, number>(CHANNEL_KINDS.map((k, i) => [k, i]))

/**
 * 按类型归堆，同一类里保留写下的先后。
 *
 * 想到一条加一条，于是真实的列表长成 email link email phone link —— 读起来像没整理过的抽屉。
 * Apple 和 Google 的联系人都按类型归堆而不给手动排序，这里跟上：少一个要维护的顺序。
 */
export function byKind<T extends { kind: ChannelKind }>(channels: readonly T[]): T[] {
  return [...channels].sort((a, b) => (ORDER.get(a.kind) ?? 9) - (ORDER.get(b.kind) ?? 9))
}

/**
 * 行上写的那串字。
 *
 * 链接写 host 加路径，电话按国家分好组，邮箱原样 —— 那就是人要读的东西。电话那条分组规则在一个
 * 单独的包里（`usePhone`），所以它是传进来的：没传、或者那一包还在路上，就按存下来的样子显示。
 */
export function channelLabel(
  kind: ChannelKind,
  value: string,
  showPhone?: (v: string) => string,
): string {
  if (kind === 'url') return linkLabel(value)
  if (kind === 'phone' && showPhone) return showPhone(value)
  return value
}

/** 空着的那一行里写什么：这一类长什么样，而不是一句「待填」。 */
export function channelPlaceholder(kind: ChannelKind): string {
  if (kind === 'email') return 'name@example.com'
  if (kind === 'phone') return '+86 139 0000 0000'
  return 'github.com/you'
}

/** 屏幕上的那两个字。`url` 在界面上叫 Link：一个人说的是链接，不是 URL。 */
export const KIND_LABEL: Record<ChannelKind, string> = {
  email: 'Email',
  phone: 'Phone',
  url: 'Link',
}

export const KIND_CHOICES = CHANNEL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))

export type { ContactChannel }
