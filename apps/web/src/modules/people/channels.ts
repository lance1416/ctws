import { CHANNEL_KINDS, type ChannelKind } from '@ctws/contracts'
import { linkLabel } from '../../platform/ui/url'

// How a person's channels look; whether a value is valid is the contract's `channelProblem`.

const ORDER = new Map<ChannelKind, number>(CHANNEL_KINDS.map((k, i) => [k, i]))

/** Grouped by kind in `CHANNEL_KINDS` order, keeping the written order within each kind. */
export function byKind<T extends { kind: ChannelKind }>(channels: readonly T[]): T[] {
  return [...channels].sort((a, b) => ORDER.get(a.kind)! - ORDER.get(b.kind)!)
}

/**
 * The text a row shows. Phone grouping is passed in because its rules load separately; without it
 * a number shows as stored.
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

export function channelPlaceholder(kind: ChannelKind): string {
  if (kind === 'email') return 'name@example.com'
  if (kind === 'phone') return '+86 139 0000 0000'
  return 'github.com/you'
}

/** `url` is called Link on screen: a person says link, not URL. */
export const KIND_LABEL: Record<ChannelKind, string> = {
  email: 'Email',
  phone: 'Phone',
  url: 'Link',
}

export const KIND_CHOICES = CHANNEL_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))

/** The link that opens a channel: `mailto:`, `tel:` or the web address. */
export function channelHref(kind: ChannelKind, value: string): string {
  if (kind === 'email') return `mailto:${value}`
  // Spaces and dashes are how a person writes a number and not how a dialler takes one.
  if (kind === 'phone') return `tel:${value.replace(/[\s-]/g, '')}`
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
