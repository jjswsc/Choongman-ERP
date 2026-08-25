import type { OrderItem } from '@/lib/pos-types'

const PRICE_EPS = 0.005

function sameCartLinePrice(a: unknown, b: unknown): boolean {
  const x = Number(a)
  const y = Number(b)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return Math.abs(x - y) < PRICE_EPS
}

function sameCartLineName(a: unknown, b: unknown): boolean {
  return String(a ?? '').trim() === String(b ?? '').trim()
}

/** 카트 줄·병합 입력에서 수량 읽기 (`quantity`·`qty` 혼용·문자열 대응) */
function lineQuantity(line: { quantity?: unknown; qty?: unknown }): number {
  const raw = line.quantity ?? line.qty
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

/** CartPanel `CartPanelAddItemPayload` 와 동일 필드 */
export type MergeCartItemInput = {
  id: string
  name: string
  price: number
  note?: string
  menuId?: string
  menuId1?: string
  menuId2?: string
  optionId?: string | null
  promoId?: string
  promoCode?: string
  promoItems?: { menuId: string; optionId: string | null; quantity: number; optionName?: string | null }[]
}

type PromoRowKey = readonly [string, string | null, number]

/** 동일 세트인데 API 행 순서만 바뀐 경우에도 병합되도록 서명 전에 정렬 */
function canonicalPromoSignature(
  rows: { menuId: string; optionId: string | null; quantity: number }[] | undefined
): string {
  const triples: PromoRowKey[] = (rows || []).map(
    (r) =>
      [String(r.menuId), r.optionId ? String(r.optionId) : null, Math.max(1, Number(r.quantity) || 1)] as const
  )
  triples.sort((a, b) => {
    const c = a[0].localeCompare(b[0])
    if (c !== 0) return c
    const d = String(a[1] ?? '').localeCompare(String(b[1] ?? ''))
    if (d !== 0) return d
    return a[2] - b[2]
  })
  return JSON.stringify(triples)
}

function newUniqueLineSuffix(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined
    if (c?.randomUUID) return c.randomUUID()
  } catch {
    /* ignore */
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** CartPanel.addItem 과 동일한 병합 규칙 (단일 진실 원천용 순수 함수) */
export function mergeCartPanelAddItem(prev: OrderItem[], item: MergeCartItemInput): OrderItem[] {
  if (item.promoId) {
    const incomingSig = canonicalPromoSignature(item.promoItems)
    const pid = String(item.promoId).trim()
    const existing = prev.find((p) => {
      if (String(p.promoId ?? '').trim() !== pid) return false
      return canonicalPromoSignature(p.promoItems as MergeCartItemInput['promoItems']) === incomingSig
    })
    if (existing) {
      const prevQty = Math.max(1, lineQuantity(existing) || 1)
      return prev.map((p) =>
        p.id === existing.id
          ? {
              ...p,
              quantity: prevQty + 1,
              ...(Array.isArray(p.promoItems) && p.promoItems.length > 0
                ? {}
                : Array.isArray(item.promoItems) && item.promoItems.length > 0
                  ? { promoItems: item.promoItems }
                  : {}),
              ...(String(p.note ?? '').trim()
                ? {}
                : String(item.note ?? '').trim()
                  ? { note: String(item.note).trim() }
                  : {}),
            }
          : p
      )
    }
    /** 테이블 기존 줄이 items_json에 promoId 없이 저장된 경우 — 같은 이름·가격이면 수량만 올림 (유니온몰 세트 추가가 새 줄이 되어 주방이 빈 delta로 스킵되던 문제) */
    const existingByNamePrice = prev.find(
      (p) =>
        sameCartLineName(p.name, item.name) &&
        sameCartLinePrice(p.price, item.price) &&
        !String(p.promoId ?? '').trim() &&
        canonicalPromoSignature(p.promoItems as MergeCartItemInput['promoItems']) === '[]'
    )
    if (existingByNamePrice) {
      const prevQty = Math.max(1, lineQuantity(existingByNamePrice) || 1)
      return prev.map((p) =>
        p.id === existingByNamePrice.id
          ? {
              ...p,
              quantity: prevQty + 1,
              promoId: item.promoId,
              ...(item.promoCode ? { promoCode: item.promoCode } : {}),
              ...(Array.isArray(item.promoItems) && item.promoItems.length > 0
                ? { promoItems: item.promoItems }
                : {}),
            }
          : p
      )
    }
    const stableBaseId = `promo-cart-${pid}-${incomingSig}`
    return [
      ...prev,
      {
        id: `${stableBaseId}-${newUniqueLineSuffix()}`,
        name: item.name,
        price: item.price,
        quantity: 1,
        ...(String(item.note ?? '').trim() ? { note: String(item.note).trim() } : {}),
        promoId: item.promoId,
        promoCode: item.promoCode,
        promoItems: item.promoItems,
      },
    ]
  }

  /** 동일 ms에 연속 탭하면 `Date.now()`만으로 id가 겹쳐 수량이 다른 줄에 매칭될 수 있음 */
  const lineId = `cart-${String(item.id ?? '').trim()}-${newUniqueLineSuffix()}`
  const existing = prev.find(
    (p) =>
      sameCartLineName(p.name, item.name) &&
      sameCartLinePrice(p.price, item.price) &&
      !p.promoId &&
      !(p.note || '').trim()
  )
  if (existing) {
    const prevQty = Math.max(1, lineQuantity(existing) || 1)
    return prev.map((p) => (p.id === existing.id ? { ...p, quantity: prevQty + 1 } : p))
  }
  const menuIdNew = String(item.menuId ?? '').trim()
  const menuId1New = String(item.menuId1 ?? '').trim()
  const menuId2New = String(item.menuId2 ?? '').trim()
  const optionIdNew = String(item.optionId ?? '').trim()
  return [
    ...prev,
    {
      id: lineId,
      name: item.name,
      price: item.price,
      quantity: 1,
      ...(menuIdNew ? { menuId: menuIdNew } : {}),
      ...(menuId1New ? { menuId1: menuId1New } : {}),
      ...(menuId2New ? { menuId2: menuId2New } : {}),
      ...(optionIdNew ? { optionId: optionIdNew } : {}),
    },
  ]
}
