import type { PosOrder, PosMenu, PosPromoWithItems } from '@/lib/api-client'
import {
  formatGrabOrderLineNoteForPrint,
  isGrabInboundPosOrder,
} from '@/lib/grab-pos-order-enrich'
import { mergeSetChildrenForReceipt } from '@/lib/pos-hall-order-receipt-document-html'
import {
  computePosPricing,
  receiptTaxDisplayFieldsFromPricing,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'
import type { ReceiptModalData } from '@/components/pos/pos-receipt-modal'
import { parseAppliedCouponsFromOrderRow } from '@/lib/pos-coupon-server'

export type PosOrderReceiptLineOptions = {
  /**
   * 주문 JSON에 promoItems 스냅샷이 없고 promoId만 있을 때(구버전·일부 저장 경로),
   * 현재 프로모 카탈로그로 구성 줄을 채운다. 선택지가 있는 세트는 DB 구성 전체가 나올 수 있다.
   */
  promoCatalogById?: Map<string, PosPromoWithItems>
  /** 미러 메뉴(id만 저장·promoId 누락) 등: pos_menus.promoId 로 프로모를 역추적 */
  menus?: PosMenu[]
  /** 프로모 구성 optionCode → 표시명 (캐셔·주방) */
  optionNameByCode?: Map<string, string>
}

type ReceiptPromoLine = {
  menuId: string
  optionId: string | null
  optionCode?: string | null
  menuName?: string
  quantity: number
}
type CatalogPromoLine = ReceiptPromoLine & { choiceGroup: string | null }

export function posOrderRowPaymentSum(row: Record<string, unknown>): number {
  return (
    Number(row.payment_cash ?? 0) +
    Number(row.payment_card ?? 0) +
    Number(row.payment_qr ?? 0) +
    Number(row.payment_other ?? 0) +
    Number((row as { payment_delivery_app?: unknown }).payment_delivery_app ?? 0)
  )
}

export function posOrderPaymentSum(order: PosOrder): number {
  return (
    Number(order.paymentCash ?? 0) +
    Number(order.paymentCard ?? 0) +
    Number(order.paymentQr ?? 0) +
    Number(order.paymentOther ?? 0) +
    Number(order.paymentDeliveryApp ?? 0)
  )
}

export function isPosOrderPaidLikeStatus(status: string): boolean {
  const s = String(status || '').toLowerCase()
  return s === 'paid' || s === 'completed'
}

function pickPromoItemsFromOrderLine(it: Record<string, unknown>): unknown[] | null {
  const camel = it.promoItems
  const snake = it.promo_items
  if (Array.isArray(camel) && camel.length > 0) return camel
  if (Array.isArray(snake) && snake.length > 0) return snake
  return null
}

function coerceNonEmptyId(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

/** DB/JSON에서 숫자·문자 혼재 가능 */
function pickPromoIdFromOrderLine(it: Record<string, unknown>): string | null {
  return coerceNonEmptyId(it.promoId) ?? coerceNonEmptyId(it.promo_id)
}

/** 카트 id 규칙: `promo-${promoId}-${구성시그니처}` (프로모 id에 하이픈 포함 가능 → 카탈로그 키 최장 일치) */
function pickPromoIdFromCartLineId(lineId: string, catalog: Map<string, PosPromoWithItems> | undefined): string | null {
  if (!catalog?.size) return null
  const id = String(lineId ?? '').trim()
  if (!id.startsWith('promo-')) return null
  const rest = id.slice('promo-'.length)
  let best: string | null = null
  for (const key of catalog.keys()) {
    if (!key) continue
    if (rest === key || rest.startsWith(`${key}-`)) {
      if (!best || key.length > best.length) best = key
    }
  }
  return best
}

function pickPromoIdFromPromoCode(it: Record<string, unknown>, catalog: Map<string, PosPromoWithItems> | undefined): string | null {
  if (!catalog?.size) return null
  const code = coerceNonEmptyId(it.promoCode) ?? coerceNonEmptyId(it.promo_code)
  if (!code) return null
  const u = code.toUpperCase()
  for (const p of catalog.values()) {
    const c = String(p.code ?? '').trim().toUpperCase()
    if (c && c === u) return String(p.id)
  }
  return null
}

function buildPromoIdByCode(catalog: Map<string, PosPromoWithItems> | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!catalog?.size) return out
  for (const p of catalog.values()) {
    const id = String(p.id ?? '').trim()
    const code = String(p.code ?? '').trim().toUpperCase()
    if (!id || !code) continue
    if (!out.has(code)) out.set(code, id)
  }
  return out
}

function pickPromoIdFromCodeToken(
  it: Record<string, unknown>,
  catalog: Map<string, PosPromoWithItems> | undefined
): string | null {
  const promoIdByCode = buildPromoIdByCode(catalog)
  if (promoIdByCode.size === 0) return null

  const explicitCode = coerceNonEmptyId(it.promoCode) ?? coerceNonEmptyId(it.promo_code)
  if (explicitCode) {
    const pid = promoIdByCode.get(explicitCode.toUpperCase())
    if (pid) return pid
  }

  const lineId = String(it.id ?? '').trim()
  const lineName = String(it.name ?? '').trim()
  const upperCandidates = [lineId.toUpperCase(), lineName.toUpperCase()].filter(Boolean)
  for (const text of upperCandidates) {
    const exact = promoIdByCode.get(text)
    if (exact) return exact
  }

  const promoLikeContext =
    lineId.toLowerCase().startsWith('promo-') ||
    /\b(set|promo|bundle|campaign)\b/i.test(lineName) ||
    lineName.includes('[[') ||
    lineName.includes(']]')
  if (!promoLikeContext) return null

  const matched = new Set<string>()
  for (const text of upperCandidates) {
    for (const [code, pid] of promoIdByCode.entries()) {
      const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(text)) {
        matched.add(pid)
      }
    }
  }
  if (matched.size !== 1) return null
  return Array.from(matched)[0] || null
}

function pickPromoIdFromLinkedMenu(it: Record<string, unknown>, menus: PosMenu[] | undefined): string | null {
  if (!menus?.length) return null
  const lineName = String(it.name ?? '').trim().toLowerCase()
  const lineIdRaw = String(it.id ?? '').trim().toLowerCase()
  const hasExplicitPromoToken =
    lineIdRaw.startsWith('promo-') ||
    /\b(set|promo|bundle|campaign)\b/i.test(lineName) ||
    lineName.includes('[[') ||
    lineName.includes(']]')
  if (!hasExplicitPromoToken) return null
  const lineId = coerceNonEmptyId(it.id)
  if (!lineId) return null
  const exact = menus.find((m) => String(m.id) === lineId)
  const fromExact = coerceNonEmptyId(exact?.promoId)
  if (fromExact) return fromExact
  const dash = lineId.indexOf('-')
  if (dash > 0) {
    const head = lineId.slice(0, dash)
    const m2 = menus.find((m) => String(m.id) === head)
    const fromHead = coerceNonEmptyId(m2?.promoId)
    if (fromHead) return fromHead
  }
  return null
}

export function normalizePromoLookupText(v: unknown): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\[\]()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s\-_/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 일부 구형/특수 주문은 promoId 없이 이름만 남는다.
 * 이름·코드로 카탈로그를 역매칭해 구성 줄을 최대한 복원한다.
 */
function pickPromoIdFromItemName(it: Record<string, unknown>, catalog: Map<string, PosPromoWithItems> | undefined): string | null {
  if (!catalog?.size) return null
  const nameRaw = String(it.name ?? '').trim()
  if (!nameRaw) return null
  const promoLikeName = /\b(set|promo|bundle|campaign)\b/i.test(nameRaw) || nameRaw.includes('[[')
  if (!promoLikeName) return null
  const key = normalizePromoLookupText(nameRaw)
  if (!key) return null

  const candidates: { id: string; score: number }[] = []
  for (const p of catalog.values()) {
    const pid = String(p.id ?? '').trim()
    if (!pid) continue
    const pname = normalizePromoLookupText(p.name)
    const pcode = normalizePromoLookupText(p.code)
    if (!pname && !pcode) continue
    let score = 0
    if (pname && key === pname) score = Math.max(score, 100)
    if (pcode && key === pcode) score = Math.max(score, 95)
    // 이름 기반은 오인식 비용이 높아 exact 일치만 허용
    if (score > 0) candidates.push({ id: pid, score })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score || b.id.length - a.id.length)
  if (candidates.length > 1 && candidates[0].score === candidates[1].score && candidates[0].id !== candidates[1].id) {
    return null
  }
  return candidates[0].id
}

/** 프로모 구성 줄 — optionCode 기반 optionName 보강 */
export function enrichPromoSnapshotForPrint(
  promoItems: ReceiptPromoLine[] | undefined,
  opts?: Pick<PosOrderReceiptLineOptions, 'optionNameByCode' | 'menus'>
): ReceiptPromoLine[] | undefined {
  if (!Array.isArray(promoItems) || promoItems.length === 0) return promoItems
  const optionNameByCode = opts?.optionNameByCode
  return promoItems.map((p) => {
    let optionName = String((p as { optionName?: unknown }).optionName ?? '').trim()
    const optionCode = String(p.optionCode ?? '').trim()
    if (!optionName && optionCode && optionNameByCode?.size) {
      const fromCode = formatGrabOrderLineNoteForPrint(`optc:${optionCode}`, optionNameByCode)
      if (fromCode && !fromCode.split(',').every((x) => /^[A-Z0-9-]+$/i.test(x.trim()))) {
        optionName = fromCode
      }
    }
    return optionName ? { ...p, optionName } : p
  })
}

function normalizeReceiptPromoLines(raw: unknown[]): ReceiptPromoLine[] {
  return raw.map((x) => {
    const o = x as Record<string, unknown>
    const opt = o.optionId ?? o.option_id
    const optStr = opt != null && String(opt).trim() ? String(opt).trim() : null
    const optionCode = o.optionCode ?? o.option_code
    const optionCodeStr = optionCode != null && String(optionCode).trim() ? String(optionCode).trim() : null
    const menuNameRaw = o.menuName ?? o.menu_name
    const menuNameStr = menuNameRaw != null && String(menuNameRaw).trim() ? String(menuNameRaw).trim() : ''
    return {
      menuId: String(o.menuId ?? o.menu_id ?? ''),
      optionId: optStr,
      ...(optionCodeStr ? { optionCode: optionCodeStr } : {}),
      ...(menuNameStr ? { menuName: menuNameStr } : {}),
      quantity: Math.max(1, Number(o.quantity ?? o.qty ?? 1) || 1),
    }
  })
}

function promoLinesFromCatalog(promoId: string, catalog: Map<string, PosPromoWithItems> | undefined): ReceiptPromoLine[] | null {
  if (!catalog?.size) return null
  const p = catalog.get(promoId)
  const items = p?.items
  if (!Array.isArray(items) || items.length === 0) return null
  const rows: CatalogPromoLine[] = items.map((x) => ({
    menuId: String(x.menuId ?? ''),
    optionId: x.optionId != null && String(x.optionId).trim() ? String(x.optionId) : null,
    ...(x.optionCode != null && String(x.optionCode).trim() ? { optionCode: String(x.optionCode).trim() } : {}),
    quantity: Math.max(1, Number(x.quantity) || 1),
    choiceGroup: String(x.choiceGroup ?? '').trim() || null,
  }))

  // 선택형 그룹 항목(명시 choice_group + 레거시 암묵 그룹)은 카탈로그만으로 선택값 복원이 불가하므로 제외.
  // 스냅샷(promoItems)이 있는 최신 주문은 이 분기까지 오지 않아 기존 선택값을 그대로 사용한다.
  const implicitChoiceKeys = new Set<string>()
  const optionIdsByMenuQty = new Map<string, Set<string>>()
  const optionKey = (r: CatalogPromoLine): string =>
    (r.optionId && String(r.optionId).trim()) || (r.optionCode && String(r.optionCode).trim()) || ''
  for (const row of rows) {
    if (row.choiceGroup) continue
    const key = `${row.menuId}::${row.quantity}`
    const bucket = optionIdsByMenuQty.get(key) ?? new Set<string>()
    const ok = optionKey(row)
    if (ok) bucket.add(ok)
    optionIdsByMenuQty.set(key, bucket)
  }
  for (const [key, optionIds] of optionIdsByMenuQty.entries()) {
    if (optionIds.size > 1) implicitChoiceKeys.add(key)
  }

  return rows
    .filter((row) => {
      if (row.choiceGroup) return false
      const implicitKey = `${row.menuId}::${row.quantity}`
      if (implicitChoiceKeys.has(implicitKey)) return false
      return true
    })
    .map((row) => ({
      menuId: row.menuId,
      optionId: row.optionId,
      ...(row.optionCode ? { optionCode: row.optionCode } : {}),
      quantity: row.quantity,
    }))
}

function resolvePromoItemsForReceiptLine(
  row: Record<string, unknown>,
  catalog: Map<string, PosPromoWithItems> | undefined,
  menus: PosMenu[] | undefined
): ReceiptPromoLine[] | null {
  const direct = pickPromoItemsFromOrderLine(row)
  if (direct && direct.length > 0) return normalizeReceiptPromoLines(direct)
  if (!catalog?.size && !menus?.length) return null

  const tryPid = (pid: string | null): ReceiptPromoLine[] | null => {
    if (!pid || !catalog?.size) return null
    return promoLinesFromCatalog(pid, catalog)
  }

  return (
    tryPid(pickPromoIdFromOrderLine(row)) ??
    tryPid(pickPromoIdFromCartLineId(String(row.id ?? ''), catalog)) ??
    tryPid(pickPromoIdFromPromoCode(row, catalog)) ??
    tryPid(pickPromoIdFromCodeToken(row, catalog)) ??
    tryPid(pickPromoIdFromLinkedMenu(row, menus)) ??
    tryPid(pickPromoIdFromItemName(row, catalog))
  )
}

/**
 * 주방 슬립 등: 줄에 `promoItems`/`promo_items` 스냅샷이 없으면 카탈로그·메뉴로 세트 구성을 채운다.
 * 이미 스냅샷이 있으면 유지한다(저장된 선택·수량).
 */
export function enrichPosOrderLikeItemsWithPromoSnapshot<T extends Record<string, unknown>>(
  items: T[],
  opts?: PosOrderReceiptLineOptions
): T[] {
  const catalog = opts?.promoCatalogById
  const menus = opts?.menus
  if (!items?.length || (!catalog?.size && !menus?.length)) return items
  return items.map((it) => {
    const direct = pickPromoItemsFromOrderLine(it)
    if (direct && direct.length > 0) {
      const enriched = enrichPromoSnapshotForPrint(normalizeReceiptPromoLines(direct), opts)
      return { ...it, promoItems: enriched } as T
    }
    const promo = resolvePromoItemsForReceiptLine(it, catalog, menus)
    if (!promo || promo.length === 0) return it
    const enriched = enrichPromoSnapshotForPrint(promo, opts) ?? promo
    return { ...it, promoItems: enriched } as T
  })
}

function posOrderItemsToReceiptLines(order: PosOrder, opts?: PosOrderReceiptLineOptions) {
  const catalog = opts?.promoCatalogById
  const menus = opts?.menus
  return (order.items || [])
    .filter((it) => !String((it as { cancelledAt?: string | null }).cancelledAt || '').trim())
    .map((it) => {
    const row = it as unknown as Record<string, unknown>
    const promo = resolvePromoItemsForReceiptLine(row, catalog, menus)
    const rowDelivery = String(row.deliveryAppCode ?? row.delivery_app_code ?? '').trim()
    const menuId = String(
      row.menuId1 ?? row.menuId ?? row.menu_id ?? (it as { menuId?: unknown }).menuId ?? ''
    ).trim()
    const promoId = pickPromoIdFromOrderLine(row)
    return {
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      price: Number(it.price ?? 0),
      qty: Math.max(1, Number(it.qty ?? (it as { quantity?: number }).quantity ?? 1) || 1),
      lineDiscountAmt: Math.max(
        0,
        Number(
          (it as { lineDiscountAmt?: unknown }).lineDiscountAmt ??
            (it as { line_discount_amt?: unknown }).line_discount_amt ??
            0
        ) || 0
      ),
      ...(menuId ? { menuId } : {}),
      ...(promoId ? { promoId } : {}),
      ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
      ...(rowDelivery ? { deliveryAppCode: rowDelivery } : {}),
      ...(promo && promo.length > 0 ? { promoItems: promo } : {}),
    }
  })
}

/**
 * 결제 영수증 HTML 등: 이미 만들어진 `ReceiptModalData.items`에 대해
 * 주방 슬립과 동일한 기준으로 promoItems 를 보강한다(DB 스냅샷 누락·재조회용).
 */
export function enrichReceiptModalItemsForPromoDisplay(
  items: ReceiptModalData['items'],
  opts?: PosOrderReceiptLineOptions
): ReceiptModalData['items'] {
  const enriched = enrichPosOrderLikeItemsWithPromoSnapshot(
    items as unknown as Record<string, unknown>[],
    opts
  ) as ReceiptModalData['items']
  return mergeSetChildrenForReceipt(
    enriched as Parameters<typeof mergeSetChildrenForReceipt>[0],
    {
      grabInbound: isGrabInboundPosOrder({ items: enriched }),
      optionNameByCode: opts?.optionNameByCode,
    }
  ) as ReceiptModalData['items']
}

/** 영수증 관리 등: DB에 저장된 합계·부가세로 재인쇄 (당시 요금 재계산 없음) */
export function receiptModalDataFromPosOrderReprint(order: PosOrder, opts?: PosOrderReceiptLineOptions): ReceiptModalData {
  const v = Number(order.vat ?? 0) || 0
  return {
    orderNo: order.orderNo ?? '',
    items: posOrderItemsToReceiptLines(order, opts),
    subtotal: order.subtotal ?? 0,
    discountAmt: order.discountAmt ?? 0,
    deliveryFee: order.deliveryFee,
    packagingFee: order.packagingFee,
    total: order.total ?? 0,
    storeCode: order.storeCode,
    orderType: order.orderType,
    tableName: order.tableName,
    memo: order.memo,
    discountReason: order.discountReason,
    appliedCoupons: parseAppliedCouponsFromOrderRow(
      (order as { appliedCoupons?: unknown; applied_coupons?: unknown }).appliedCoupons ??
        (order as { applied_coupons?: unknown }).applied_coupons
    ),
    paymentCash: order.paymentCash,
    ...(Math.max(0, Number(order.paymentCashTendered ?? 0) || 0) > 0.005
      ? { paymentCashTendered: Math.max(0, Number(order.paymentCashTendered ?? 0) || 0) }
      : {}),
    paymentCard: order.paymentCard,
    paymentQr: order.paymentQr,
    paymentOther: order.paymentOther,
    ...(order.paymentOtherBreakdown ? { paymentOtherBreakdown: order.paymentOtherBreakdown } : {}),
    paymentDeliveryApp: order.paymentDeliveryApp,
    deliveryPaymentChannel: order.deliveryPaymentChannel ?? null,
    ...(String(order.deliveryAppCode ?? '').trim()
      ? { deliveryAppCode: String(order.deliveryAppCode).trim().toLowerCase() }
      : {}),
    ...(v > 0.001 ? { vatFeeAmt: v, vatFeeMode: 'separate' as const } : {}),
    receiptAutoPrintContext: 'payment',
    suppressReceiptModalAutoPrint: true,
  }
}

/** 결제 완료 영수증 모달용 데이터 (메인 포스 Realtime·폴링에서 인쇄) */
export function receiptModalDataFromPosOrderForPayment(
  order: PosOrder,
  adjustments: PosPricingAdjustments,
  opts?: PosOrderReceiptLineOptions
): ReceiptModalData {
  const pricing = computePosPricing({
    subtotal: order.subtotal ?? 0,
    discountAmt: order.discountAmt ?? 0,
    deliveryFee: order.deliveryFee ?? 0,
    packagingFee: order.packagingFee ?? 0,
    cardPaymentAmount: order.paymentCard ?? 0,
    adjustments,
  })
  return {
    orderNo: order.orderNo ?? '',
    items: posOrderItemsToReceiptLines(order, opts),
    subtotal: order.subtotal ?? 0,
    discountAmt: order.discountAmt ?? 0,
    deliveryFee: order.deliveryFee,
    packagingFee: order.packagingFee,
    total: pricing.finalTotal,
    storeCode: order.storeCode,
    orderType: order.orderType,
    tableName: order.tableName,
    memo: order.memo,
    discountReason: order.discountReason,
    appliedCoupons: parseAppliedCouponsFromOrderRow(
      (order as { appliedCoupons?: unknown; applied_coupons?: unknown }).appliedCoupons ??
        (order as { applied_coupons?: unknown }).applied_coupons
    ),
    paymentCash: order.paymentCash,
    ...(Math.max(0, Number(order.paymentCashTendered ?? 0) || 0) > 0.005
      ? { paymentCashTendered: Math.max(0, Number(order.paymentCashTendered ?? 0) || 0) }
      : {}),
    paymentCard: order.paymentCard,
    paymentQr: order.paymentQr,
    paymentOther: order.paymentOther,
    ...(order.paymentOtherBreakdown ? { paymentOtherBreakdown: order.paymentOtherBreakdown } : {}),
    paymentDeliveryApp: order.paymentDeliveryApp,
    deliveryPaymentChannel: order.deliveryPaymentChannel ?? null,
    ...(String(order.deliveryAppCode ?? '').trim()
      ? { deliveryAppCode: String(order.deliveryAppCode).trim().toLowerCase() }
      : {}),
    vatFeeAmt: pricing.vatFeeAmt,
    vatFeeMode: pricing.vatFeeMode,
    ...receiptTaxDisplayFieldsFromPricing(pricing),
    serviceFeeAmt: pricing.serviceFeeAmt,
    serviceFeeMode: pricing.serviceFeeMode,
    cardFeeAmt: pricing.cardFeeAmt,
    cardFeeMode: pricing.cardFeeMode,
    otherFeeAmt: pricing.otherFeeAmt,
    otherFeeMode: pricing.otherFeeMode,
    receiptAutoPrintContext: 'payment',
    suppressReceiptModalAutoPrint: false,
  }
}
