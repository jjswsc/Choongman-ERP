import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import {
  orderTypeToPromoRegularPriceChannel,
  resolvePromoRegularPricePerSet,
  type PromoPricingCatalog,
} from '@/lib/pos-order-promo-regular-price'
import {
  resolveDeliveryPlatformBundleDiscountAmt,
  resolveDeliveryPlatformBundleKey,
  resolvePlatformDiscountReasonForAnalytics,
  type DeliveryPlatformDiscountOrderRow,
} from '@/lib/pos-platform-discount-reason'

type OrderRow = DeliveryPlatformDiscountOrderRow & { memo?: string | null }

export type DeliveryPlatformPromoLineShare = {
  key: string
  promoId: string
  promoCode: string
  name: string
  qty: number
  saleAmount: number
  regularAmount: number
  estimatedLineQty: number
  unresolvedLineQty: number
  allocatedDiscount: number
}

export type DeliveryPlatformPromoLineShares = {
  platformKey: string
  appLabel: string
  discountAmt: number
  residualLabel: string
  lines: DeliveryPlatformPromoLineShare[]
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseOrderItems(itemsJson: string | null | undefined): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(String(itemsJson || '[]'))
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

function resolveLineSaleAmount(row: Record<string, unknown>, qty: number): number {
  const price = Math.max(0, Number(row.price ?? 0) || 0)
  const lineDisc = Math.max(
    0,
    Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0
  )
  return Math.max(0, qty * price - lineDisc)
}

export function deliveryPlatformAppLabel(platformKey: string): string {
  const slug = String(platformKey || '')
    .replace(/^platform::/i, '')
    .split('::')[0]
    ?.toLowerCase()
  if (slug === 'grab') return 'Grab'
  if (slug === 'shopee') return 'Shopee'
  if (slug === 'lineman') return 'Line Man'
  if (slug === 'foodpanda') return 'Foodpanda'
  if (slug === 'robinhood') return 'Robinhood'
  return slug ? slug.toUpperCase() : 'Delivery'
}

function formatPlatformLineName(appLabel: string, menuName: string): string {
  const name = menuName.trim() || '(세트·프로모)'
  return `${appLabel} · ${name}`
}

function resolveLinePromoId(row: Record<string, unknown>, catalog: PromoPricingCatalog): string {
  const promoId = str(row.promoId ?? row.promo_id)
  if (promoId) return promoId
  const menuId = str(row.menuId ?? row.menu_id)
  if (!menuId) return ''
  return str(catalog.promoIdByMirrorMenuId.get(menuId))
}

function resolvePromoMeta(
  promoId: string,
  promoCode: string,
  lineName: string,
  catalog: PromoPricingCatalog
): { code: string; name: string } {
  if (promoId) {
    const hit = catalog.promoMetaById.get(promoId)
    if (hit) {
      return {
        code: hit.code || promoCode,
        name: hit.name || lineName,
      }
    }
  }
  const code = promoCode || promoId
  return {
    code,
    name: lineName || code || '(세트·프로모)',
  }
}

function resolveMenuRegularAmount(
  row: Record<string, unknown>,
  catalog: PromoPricingCatalog,
  qty: number,
  channel: 'hall' | 'delivery'
): { amount: number; unresolved: boolean } {
  const menuId = str(row.menuId ?? row.menu_id)
  const lineName = str(row.name)
  const menu = menuId
    ? catalog.menus.find((m) => String(m.id) === menuId)
    : catalog.menus.find((m) => String(m.name ?? '').trim() === lineName)
  if (!menu) return { amount: 0, unresolved: true }
  const hall = Math.max(0, Number(menu.price ?? 0) || 0)
  const delivery =
    menu.priceDelivery != null && Number.isFinite(Number(menu.priceDelivery))
      ? Math.max(0, Number(menu.priceDelivery) || 0)
      : hall
  const unit = channel === 'delivery' ? delivery || hall : hall
  if (unit <= 0.0001) return { amount: 0, unresolved: true }
  return { amount: round2(unit * qty), unresolved: false }
}

function menuLineKey(row: Record<string, unknown>): string {
  const menuId = str(row.menuId ?? row.menu_id)
  if (menuId) return `menuId:${menuId}`
  const name = str(row.name).toLowerCase().replace(/\s+/g, ' ')
  return `menu:${name || '(unnamed)'}`
}

type RawLine = Omit<DeliveryPlatformPromoLineShare, 'allocatedDiscount'> & { weight: number }

function lineWeight(regularAmount: number, saleAmount: number, qty: number): number {
  const implied = round2(Math.max(0, regularAmount - saleAmount))
  if (implied > 0.0001) return implied
  if (saleAmount > 0.0001) return saleAmount
  return Math.max(0, qty)
}

function collectRawLines(
  order: OrderRow,
  catalog: PromoPricingCatalog,
  platformKey: string,
  appLabel: string
): RawLine[] {
  const items = parseOrderItems(order.items_json)
  const channel = orderTypeToPromoRegularPriceChannel(order.order_type)
  const promoLines: RawLine[] = []
  const menuLines: RawLine[] = []

  for (const row of items) {
    const qty = Math.max(0, resolveItemsJsonLineQty(row))
    if (qty <= 0) continue

    const promoId = resolveLinePromoId(row, catalog)
    const promoCode = str(row.promoCode ?? row.promo_code)
    const lineName = str(row.name)
    const saleAmount = resolveLineSaleAmount(row, qty)

    if (promoId || promoCode) {
      const meta = resolvePromoMeta(promoId, promoCode, lineName, catalog)
      const regularResolved = resolvePromoRegularPricePerSet({
        row,
        promoId,
        channel,
        catalog,
      })
      let regularAmount = 0
      let estimatedLineQty = 0
      let unresolvedLineQty = 0
      if (regularResolved.source == null) {
        unresolvedLineQty = qty
      } else {
        regularAmount = round2(regularResolved.regularPerSet * qty)
        if (regularResolved.estimated) estimatedLineQty = qty
      }
      const keyToken = promoId || promoCode || meta.name
      promoLines.push({
        key: `${platformKey}::promo::${keyToken}`,
        promoId,
        promoCode: meta.code || promoCode || appLabel.toUpperCase(),
        name: formatPlatformLineName(appLabel, meta.name || lineName),
        qty,
        saleAmount,
        regularAmount,
        estimatedLineQty,
        unresolvedLineQty,
        weight: lineWeight(regularAmount, saleAmount, qty),
      })
      continue
    }

    const menuReg = resolveMenuRegularAmount(row, catalog, qty, channel)
    menuLines.push({
      key: `${platformKey}::${menuLineKey(row)}`,
      promoId: '',
      promoCode: appLabel.toUpperCase(),
      name: formatPlatformLineName(appLabel, lineName || menuLineKey(row)),
      qty,
      saleAmount,
      regularAmount: menuReg.amount,
      estimatedLineQty: 0,
      unresolvedLineQty: menuReg.unresolved ? qty : 0,
      weight: lineWeight(menuReg.amount, saleAmount, qty),
    })
  }

  return mergeRawLines(promoLines.length > 0 ? promoLines : menuLines)
}

function mergeRawLines(lines: RawLine[]): RawLine[] {
  const map = new Map<string, RawLine>()
  for (const line of lines) {
    const prev = map.get(line.key)
    if (!prev) {
      map.set(line.key, { ...line })
      continue
    }
    prev.qty += line.qty
    prev.saleAmount = round2(prev.saleAmount + line.saleAmount)
    prev.regularAmount = round2(prev.regularAmount + line.regularAmount)
    prev.estimatedLineQty += line.estimatedLineQty
    prev.unresolvedLineQty += line.unresolvedLineQty
    prev.weight = round2(prev.weight + line.weight)
    if (!prev.promoId && line.promoId) prev.promoId = line.promoId
    if (!prev.promoCode && line.promoCode) prev.promoCode = line.promoCode
  }
  return Array.from(map.values())
}

function allocateRounded(total: number, weights: number[]): number[] {
  if (weights.length === 0) return []
  const sumW = weights.reduce((s, w) => s + w, 0)
  if (sumW <= 0.0001) {
    const even = round2(total / weights.length)
    const out = weights.map(() => even)
    const drift = round2(total - out.reduce((s, n) => s + n, 0))
    if (out.length > 0) out[0] = round2(out[0] + drift)
    return out
  }
  const raw = weights.map((w) => (w / sumW) * total)
  const floors = raw.map((x) => Math.floor(x * 100) / 100)
  const leftoverCents = Math.round((total - floors.reduce((s, n) => s + n, 0)) * 100)
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < leftoverCents && order.length > 0; k++) {
    const idx = order[k % order.length]!.i
    floors[idx] = round2(floors[idx]! + 0.01)
  }
  return floors
}

export function collectDeliveryPlatformPromoLineShares(params: {
  order: OrderRow
  catalog: PromoPricingCatalog
}): DeliveryPlatformPromoLineShares {
  const discountAmt = resolveDeliveryPlatformBundleDiscountAmt(params.order)
  const platformKey = resolveDeliveryPlatformBundleKey(params.order)
  const appLabel = deliveryPlatformAppLabel(platformKey)
  const residualLabel = resolvePlatformDiscountReasonForAnalytics(params.order, discountAmt)
  if (discountAmt <= 0.0001) {
    return { platformKey, appLabel, discountAmt: 0, residualLabel, lines: [] }
  }

  const raw = collectRawLines(params.order, params.catalog, platformKey, appLabel)
  if (raw.length === 0) {
    return { platformKey, appLabel, discountAmt, residualLabel, lines: [] }
  }

  const allocated = allocateRounded(
    discountAmt,
    raw.map((line) => line.weight)
  )
  return {
    platformKey,
    appLabel,
    discountAmt,
    residualLabel,
    lines: raw.map((line, i) => ({
      key: line.key,
      promoId: line.promoId,
      promoCode: line.promoCode,
      name: line.name,
      qty: line.qty,
      saleAmount: line.saleAmount,
      regularAmount: line.regularAmount,
      estimatedLineQty: line.estimatedLineQty,
      unresolvedLineQty: line.unresolvedLineQty,
      allocatedDiscount: allocated[i] ?? 0,
    })),
  }
}

/** 검색용 — Grab/Shopee 영문 라벨에 한글 별칭을 붙인다 */
export function extraPlatformPromoSearchHaystack(row: {
  key?: string
  name?: string
  promoCode?: string
  promoId?: string
}): string {
  const blob = [row.key, row.name, row.promoCode, row.promoId].join(' ').toLowerCase()
  const extra: string[] = []
  if (blob.includes('grab')) extra.push('grab', '그랩', '그라브')
  if (blob.includes('shopee')) extra.push('shopee', '쇼피', '쇼피푸드')
  if (blob.includes('lineman') || blob.includes('line man')) {
    extra.push('lineman', 'line man', '라인맨', '라인만')
  }
  if (blob.includes('foodpanda')) extra.push('foodpanda', '푸드판다')
  if (blob.includes('robinhood')) extra.push('robinhood', '로빈후드')
  if (blob.includes('platform') || blob.startsWith('platform::')) {
    extra.push('플랫폼', '배달앱', '배달')
  }
  return extra.join(' ')
}
