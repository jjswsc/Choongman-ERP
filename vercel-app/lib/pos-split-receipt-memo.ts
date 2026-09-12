/** POS 분할 결제 영수증 스냅샷 — 주문 memo에 저장해 사후 세금계산서·재인쇄에 사용 */

import type { PosPaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'

export const POS_SPLIT_RECEIPTS_MARKER = '[POS_SPLIT_RECEIPTS]'

export type PosSplitReceiptPaymentSnapshot = {
  paymentCash?: number
  paymentCard?: number
  paymentQr?: number
  paymentQrType?: 'THAI_QR' | 'CREDIT_CARD' | 'EDC'
  paymentOther?: number
  paymentOtherBreakdown?: PosPaymentOtherBreakdown | null
  paymentDeliveryApp?: number
  deliveryPaymentChannel?: string | null
  paymentCashTendered?: number
}

export type PosSplitReceiptLineSnapshot = {
  id: string
  name: string
  price: number
  quantity: number
  note?: string
  menuId?: string
  optionId?: string
  /** 선택 메뉴에만 붙는 줄 할인(Lucky Day 등). 없으면 영수증이 전 메뉴에 비례 배분함 */
  lineDiscountAmt?: number
}

export type PosSplitReceiptMemberSnapshot = {
  memberId?: number
  memberNo?: string
  memberPhone?: string
  memberTierCode?: string
  memberPointEarned?: number
  memberPointBalance?: number
  collabJoined?: boolean
}

export type PosSplitReceiptSnapshot = {
  key: string
  label: string
  items: PosSplitReceiptLineSnapshot[]
  subtotal: number
  discountAmt: number
  total: number
  payment?: PosSplitReceiptPaymentSnapshot
  member?: PosSplitReceiptMemberSnapshot
}

const SPLIT_MARKER_LINE = /^\[POS_SPLIT_RECEIPTS\]\s+(\S+)\s*$/i

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function toBase64Url(json: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  const b64 = btoa(binary)
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64 + pad, 'base64').toString('utf8')
  }
  const binary = atob(b64 + pad)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function coercePaymentSnapshot(raw: unknown): PosSplitReceiptPaymentSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as Record<string, unknown>
  const out: PosSplitReceiptPaymentSnapshot = {
    paymentCash: Math.max(0, Number(p.paymentCash ?? 0) || 0),
    paymentCard: Math.max(0, Number(p.paymentCard ?? 0) || 0),
    paymentQr: Math.max(0, Number(p.paymentQr ?? 0) || 0),
    paymentOther: Math.max(0, Number(p.paymentOther ?? 0) || 0),
    paymentDeliveryApp: Math.max(0, Number(p.paymentDeliveryApp ?? 0) || 0),
    deliveryPaymentChannel:
      p.deliveryPaymentChannel != null && String(p.deliveryPaymentChannel).trim()
        ? String(p.deliveryPaymentChannel).trim()
        : null,
    paymentCashTendered: Math.max(0, Number(p.paymentCashTendered ?? 0) || 0),
  }
  if (p.paymentQrType === 'THAI_QR' || p.paymentQrType === 'CREDIT_CARD' || p.paymentQrType === 'EDC') {
    out.paymentQrType = p.paymentQrType
  }
  if (p.paymentOtherBreakdown && typeof p.paymentOtherBreakdown === 'object') {
    out.paymentOtherBreakdown = p.paymentOtherBreakdown as PosPaymentOtherBreakdown
  }
  const sum =
    (out.paymentCash ?? 0) +
    (out.paymentCard ?? 0) +
    (out.paymentQr ?? 0) +
    (out.paymentOther ?? 0) +
    (out.paymentDeliveryApp ?? 0)
  if (sum <= 0.005 && (out.paymentCashTendered ?? 0) <= 0.005) return undefined
  return out
}

function coerceMemberSnapshot(raw: unknown): PosSplitReceiptMemberSnapshot | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const memberId = Math.max(0, Math.trunc(Number(o.memberId ?? o.mid ?? 0) || 0))
  const memberNo = String(o.memberNo ?? o.mno ?? '').trim()
  const memberPhone = String(o.memberPhone ?? o.mph ?? '').trim()
  const memberTierCode = String(o.memberTierCode ?? o.mt ?? '').trim()
  const memberPointEarned = round2(Math.max(0, Number(o.memberPointEarned ?? o.pe ?? 0) || 0))
  const memberPointBalance = Number(o.memberPointBalance ?? o.pb)
  const collabJoined = o.collabJoined ?? o.cj
  const out: PosSplitReceiptMemberSnapshot = {}
  if (memberId > 0) out.memberId = memberId
  if (memberNo) out.memberNo = memberNo
  if (memberPhone) out.memberPhone = memberPhone
  if (memberTierCode) out.memberTierCode = memberTierCode
  if (memberPointEarned > 0.0001) out.memberPointEarned = memberPointEarned
  if (Number.isFinite(memberPointBalance)) out.memberPointBalance = round2(memberPointBalance)
  if (collabJoined === true || collabJoined === 1 || collabJoined === '1') out.collabJoined = true
  if (collabJoined === false || collabJoined === 0 || collabJoined === '0') out.collabJoined = false
  return Object.keys(out).length > 0 ? out : undefined
}

function coerceLineSnapshot(raw: unknown): PosSplitReceiptLineSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const name = String(row.name ?? '').trim()
  const qty = Math.max(0, Math.trunc(Number(row.quantity ?? row.qty ?? 0) || 0))
  if (!name || qty <= 0) return null
  const note = String(row.note ?? '').trim()
  const menuId = String(row.menuId ?? row.menu_id ?? '').trim()
  const optionId = String(row.optionId ?? row.option_id ?? '').trim()
  const lineDiscountAmt = round2(
    Math.max(0, Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0)
  )
  return {
    id: String(row.id ?? '').trim() || `${name}:${qty}`,
    name,
    price: Number(row.price ?? 0) || 0,
    quantity: qty,
    ...(note ? { note } : {}),
    ...(menuId ? { menuId } : {}),
    ...(optionId ? { optionId } : {}),
    ...(lineDiscountAmt > 0.0001 ? { lineDiscountAmt } : {}),
  }
}

/** cart-panel splitReceipts 등 외부 payload → memo 저장용 스냅샷 */
export function normalizePosSplitReceiptSnapshots(raw: unknown): PosSplitReceiptSnapshot[] | null {
  if (!Array.isArray(raw) || raw.length <= 1) return null
  const out: PosSplitReceiptSnapshot[] = []
  for (let idx = 0; idx < raw.length; idx += 1) {
    const row = raw[idx]
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    const itemsRaw = Array.isArray(o.items) ? o.items : []
    const items = itemsRaw
      .map(coerceLineSnapshot)
      .filter((it): it is PosSplitReceiptLineSnapshot => it != null)
    const subtotal = round2(Math.max(0, Number(o.subtotal ?? 0) || 0))
    const total = round2(Math.max(0, Number(o.total ?? 0) || 0))
    if (items.length === 0 && total <= 0.005) continue
    const member = coerceMemberSnapshot(o.member && typeof o.member === 'object' ? o.member : o)
    out.push({
      key: String(o.key ?? `split-${idx + 1}`).trim() || `split-${idx + 1}`,
      label: String(o.label ?? `${idx + 1}/${raw.length}`).trim() || `${idx + 1}/${raw.length}`,
      items,
      subtotal,
      discountAmt: round2(Math.max(0, Number(o.discountAmt ?? 0) || 0)),
      total: total > 0 ? total : subtotal,
      ...(o.payment ? { payment: coercePaymentSnapshot(o.payment) } : {}),
      ...(member ? { member } : {}),
    })
  }
  return out.length > 1 ? out : null
}

export function serializePosSplitReceiptsMarker(splits: PosSplitReceiptSnapshot[]): string {
  const compact = splits.map((s) => ({
    k: s.key,
    l: s.label,
    i: s.items.map((it) => ({
      id: it.id,
      n: it.name,
      p: it.price,
      q: it.quantity,
      ...(it.note ? { note: it.note } : {}),
      ...(it.menuId ? { m: it.menuId } : {}),
      ...(it.optionId ? { o: it.optionId } : {}),
      ...(Math.max(0, Number(it.lineDiscountAmt) || 0) > 0.0001
        ? { ld: round2(Math.max(0, Number(it.lineDiscountAmt) || 0)) }
        : {}),
    })),
    s: s.subtotal,
    d: s.discountAmt,
    t: s.total,
    ...(s.payment ? { pay: s.payment } : {}),
    ...(s.member?.memberId && s.member.memberId > 0 ? { mid: s.member.memberId } : {}),
    ...(s.member?.memberNo ? { mno: s.member.memberNo } : {}),
    ...(s.member?.memberPhone ? { mph: s.member.memberPhone } : {}),
    ...(s.member?.memberTierCode ? { mt: s.member.memberTierCode } : {}),
    ...(Math.max(0, Number(s.member?.memberPointEarned) || 0) > 0.0001
      ? { pe: round2(Math.max(0, Number(s.member?.memberPointEarned) || 0)) }
      : {}),
    ...(s.member?.memberPointBalance != null && Number.isFinite(Number(s.member.memberPointBalance))
      ? { pb: round2(Number(s.member.memberPointBalance)) }
      : {}),
    ...(s.member?.collabJoined === true ? { cj: 1 } : {}),
    ...(s.member?.collabJoined === false ? { cj: 0 } : {}),
  }))
  return `${POS_SPLIT_RECEIPTS_MARKER} ${toBase64Url(JSON.stringify(compact))}`
}

function deserializePosSplitReceiptsMarker(encoded: string): PosSplitReceiptSnapshot[] | null {
  const raw = String(encoded ?? '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as unknown
    if (!Array.isArray(parsed) || parsed.length <= 1) return null
    const out: PosSplitReceiptSnapshot[] = []
    for (let idx = 0; idx < parsed.length; idx += 1) {
      const row = parsed[idx]
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const itemsRaw = Array.isArray(o.i) ? o.i : []
      const items = itemsRaw
        .map((it) => {
          if (!it || typeof it !== 'object') return null
          const line = it as Record<string, unknown>
          return coerceLineSnapshot({
            id: line.id,
            name: line.n,
            price: line.p,
            quantity: line.q,
            note: line.note,
            menuId: line.m,
            optionId: line.o,
            lineDiscountAmt: line.ld,
          })
        })
        .filter((it): it is PosSplitReceiptLineSnapshot => it != null)
      const subtotal = round2(Math.max(0, Number(o.s ?? 0) || 0))
      const total = round2(Math.max(0, Number(o.t ?? 0) || 0))
      if (items.length === 0 && total <= 0.005) continue
      const member = coerceMemberSnapshot(o)
      out.push({
        key: String(o.k ?? `split-${idx + 1}`).trim() || `split-${idx + 1}`,
        label: String(o.l ?? `${idx + 1}/${parsed.length}`).trim() || `${idx + 1}/${parsed.length}`,
        items,
        subtotal,
        discountAmt: round2(Math.max(0, Number(o.d ?? 0) || 0)),
        total: total > 0 ? total : subtotal,
        ...(o.pay ? { payment: coercePaymentSnapshot(o.pay) } : {}),
        ...(member ? { member } : {}),
      })
    }
    return out.length > 1 ? out : null
  } catch {
    return null
  }
}

export function stripPosSplitReceiptsMarker(text: string): string {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => !SPLIT_MARKER_LINE.test(String(line || '').trim()))
    .join('\n')
    .replace(new RegExp(`${POS_SPLIT_RECEIPTS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+\\S+`, 'g'), '')
    .trim()
}

export function parsePosSplitReceiptsFromMemo(memo: string | undefined | null): PosSplitReceiptSnapshot[] | null {
  const raw = String(memo ?? '')
  if (!raw.trim()) return null
  for (const line of raw.split(/\r?\n/)) {
    const m = SPLIT_MARKER_LINE.exec(String(line || '').trim())
    if (m?.[1]) return deserializePosSplitReceiptsMarker(m[1])
  }
  const inline = new RegExp(
    `${POS_SPLIT_RECEIPTS_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\S+)`,
    'i'
  ).exec(raw)
  if (inline?.[1]) return deserializePosSplitReceiptsMarker(inline[1])
  return null
}

/** 결제 완료 시 memo에 분할 스냅샷을 저장한다. 2건 미만이면 기존 블록을 제거한다. */
export function upsertPosSplitReceiptsInMemo(
  memo: string | undefined | null,
  splits: PosSplitReceiptSnapshot[] | null | undefined
): string {
  const base = stripPosSplitReceiptsMarker(String(memo ?? '').trim())
  const normalized = splits && splits.length > 1 ? splits : null
  if (!normalized) return base
  const marker = serializePosSplitReceiptsMarker(normalized)
  if (!base) return marker
  return `${base}\n${marker}`
}

export function collectSplitLoyaltyGroups(
  splits: PosSplitReceiptSnapshot[] | null | undefined,
  fallbackMemberId = 0
): { memberId: number; totalAmount: number; keys: string[] }[] {
  const rows = Array.isArray(splits) ? splits : []
  const byMember = new Map<number, { totalAmount: number; keys: string[] }>()
  for (const split of rows) {
    const memberId = Math.max(0, Math.trunc(Number(split.member?.memberId ?? 0) || 0))
    if (memberId <= 0) continue
    const total = Math.max(0, Number(split.total) || 0)
    const prev = byMember.get(memberId)
    if (prev) {
      prev.totalAmount = round2(prev.totalAmount + total)
      prev.keys.push(String(split.key || ''))
    } else {
      byMember.set(memberId, { totalAmount: round2(total), keys: [String(split.key || '')] })
    }
  }
  if (byMember.size > 0) {
    return [...byMember.entries()].map(([memberId, g]) => ({ memberId, ...g }))
  }
  const fallback = Math.max(0, Math.trunc(Number(fallbackMemberId) || 0))
  if (fallback <= 0) return []
  const orderTotal = round2(rows.reduce((s, split) => s + Math.max(0, Number(split.total) || 0), 0))
  return [
    {
      memberId: fallback,
      totalAmount: orderTotal,
      keys: rows.map((split) => String(split.key || '')),
    },
  ]
}

export function attachSplitLoyaltyToSnapshots(
  splits: PosSplitReceiptSnapshot[],
  perSplit: Array<{
    key: string
    memberId: number
    memberNo?: string
    memberPhone?: string
    memberTierCode?: string
    pointEarned: number
    pointBalanceExcludingEarn?: number
  }>
): PosSplitReceiptSnapshot[] {
  const byKey = new Map(perSplit.map((row) => [row.key, row]))
  return splits.map((split) => {
    const hit = byKey.get(String(split.key || ''))
    if (!hit) return split
    return {
      ...split,
      member: {
        ...(split.member || {}),
        memberId: hit.memberId,
        ...(hit.memberNo ? { memberNo: hit.memberNo } : {}),
        ...(hit.memberPhone ? { memberPhone: hit.memberPhone } : {}),
        ...(hit.memberTierCode ? { memberTierCode: hit.memberTierCode } : {}),
        memberPointEarned: hit.pointEarned,
        ...(hit.pointBalanceExcludingEarn != null
          ? { memberPointBalance: hit.pointBalanceExcludingEarn }
          : {}),
      },
    }
  })
}
