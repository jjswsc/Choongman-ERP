/**
 * pos_orders.payment_other_breakdown — POS 「기타」 세부 + 관리자 결제 라인.
 * payment_other 합계와 일치해야 함(±0.02).
 */

export type PosPaymentOtherBreakdown = {
  trueMoney?: number
  weChat?: number
  alipay?: number
  unionPay?: number
  linePay?: number
  shopeePay?: number
  /** POS 기타(직접입력) */
  misc?: number
  /** pos_payment_method_items.id → 금액 */
  admin?: Record<string, number>
}

const EPS = 0.02

function num(n: unknown): number {
  const v = Math.max(0, Number(n) || 0)
  return Math.round(v * 100) / 100
}

export function sumPaymentOtherBreakdown(b: PosPaymentOtherBreakdown | null | undefined): number {
  if (!b) return 0
  let s = 0
  s += num(b.trueMoney)
  s += num(b.weChat)
  s += num(b.alipay)
  s += num(b.unionPay)
  s += num(b.linePay)
  s += num(b.shopeePay)
  s += num(b.misc)
  if (b.admin && typeof b.admin === 'object') {
    for (const v of Object.values(b.admin)) {
      s += num(v)
    }
  }
  return Math.round(s * 100) / 100
}

/** API·DB에서 온 값을 객체로 정규화 (빈 객체는 null) */
export function parsePaymentOtherBreakdown(raw: unknown): PosPaymentOtherBreakdown | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw) as unknown
      return parsePaymentOtherBreakdown(j)
    } catch {
      return null
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const adminRaw = o.admin
  let admin: Record<string, number> | undefined
  if (adminRaw && typeof adminRaw === 'object' && !Array.isArray(adminRaw)) {
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(adminRaw as Record<string, unknown>)) {
      const nk = String(k || '').trim()
      if (!nk) continue
      const nv = num(v)
      if (nv > 0) m[nk] = nv
    }
    if (Object.keys(m).length > 0) admin = m
  }
  const out: PosPaymentOtherBreakdown = {
    ...(num(o.trueMoney) > 0 ? { trueMoney: num(o.trueMoney) } : {}),
    ...(num(o.weChat) > 0 ? { weChat: num(o.weChat) } : {}),
    ...(num(o.alipay) > 0 ? { alipay: num(o.alipay) } : {}),
    ...(num(o.unionPay) > 0 ? { unionPay: num(o.unionPay) } : {}),
    ...(num(o.linePay) > 0 ? { linePay: num(o.linePay) } : {}),
    ...(num(o.shopeePay) > 0 ? { shopeePay: num(o.shopeePay) } : {}),
    ...(num(o.misc) > 0 ? { misc: num(o.misc) } : {}),
    ...(admin ? { admin } : {}),
  }
  if (sumPaymentOtherBreakdown(out) <= 0) return null
  return out
}

/** DB 저장용 JSON (null = 컬럼 비움) */
export function paymentOtherBreakdownForDb(
  b: PosPaymentOtherBreakdown | null | undefined
): Record<string, unknown> | null {
  const parsed = parsePaymentOtherBreakdown(b)
  if (!parsed) return null
  return parsed as Record<string, unknown>
}

/** payment_other 와 합계 일치 시에만 breakdown 반환, 아니면 null (저장 시 무시) */
export function coercePaymentOtherBreakdownForSave(
  paymentOther: number,
  raw: unknown
): PosPaymentOtherBreakdown | null {
  const other = num(paymentOther)
  if (other <= EPS) return null
  const b = parsePaymentOtherBreakdown(raw)
  if (!b) return null
  const sum = sumPaymentOtherBreakdown(b)
  if (sum <= EPS) return null
  if (Math.abs(sum - other) > EPS) return null
  return b
}

/** 검색·필터용 소문자 키워드 나열 */
export function paymentOtherBreakdownSearchTokens(b: PosPaymentOtherBreakdown | null | undefined): string {
  if (!b) return ''
  const parts: string[] = []
  if (num(b.trueMoney) > 0) parts.push('truemoney', 'true', 'money', 'ทรูมันนี่')
  if (num(b.weChat) > 0) parts.push('wechat', 'weixin', '위챗')
  if (num(b.alipay) > 0) parts.push('alipay', '알리')
  if (num(b.unionPay) > 0) parts.push('unionpay', 'union pay', 'cup', 'ยูเนี่ยนเพย์')
  if (num(b.linePay) > 0) parts.push('linepay', 'line pay', '라인페이')
  if (num(b.shopeePay) > 0) parts.push('shopeepay', 'shopee pay', '쇼피')
  if (num(b.misc) > 0) parts.push('misc', 'other', '기타')
  if (b.admin && typeof b.admin === 'object') {
    parts.push('admin', 'wallet')
    parts.push(...Object.keys(b.admin).map((k) => String(k).toLowerCase()))
  }
  return parts.join(' ')
}
