import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import { resolvePosSalesDiscountAmount } from '@/lib/pos-coupon-domain'
import type { PosMenuCostIndexEntry } from '@/lib/pos-menu-cost-index-server'
import {
  buildTheoreticalCostResolveContext,
  expandOrderLineToCostLines,
  isDeliveryChannelOrderType,
  type TheoreticalCostResolveContext,
} from '@/lib/management-margin-theoretical-cost'
import { calcRegularPriceSum } from '@/lib/promo-economics'
import {
  orderTypeToPromoRegularPriceChannel,
  type PromoPricingCatalog,
  type RegularPriceChannel,
} from '@/lib/pos-order-promo-regular-price'
import type { PosMenuCatalogRow } from '@/lib/pos-sales-menu-hierarchy-aggregate'

const EMPTY_MAIN = '(대분류 없음)'

export type PosCostCategoryWeightedRow = {
  categoryMain: string
  netSales: number
  totalCost: number
  foodCost: number
  packagingCost: number
  costPctOfNet: number
  matchedQty: number
  unmatchedQty: number
}

export type PosCostCategoryWeightedMeta = {
  /** BOM 미매칭으로 대분류 합계에서 뺀 배분 매출 */
  excludedUnmatchedSales: number
  excludedUnmatchedQty: number
  /** 라인 할인 외 잔여 결제·쿠폰 할인(대분류 분모에 반영) */
  paymentDiscountAllocated: number
  /** 서비스(컴프) 금액(대분류 분모에 반영) */
  serviceAmtAllocated: number
}

export type PosCostCategoryWeightedResult = {
  rows: PosCostCategoryWeightedRow[]
  meta: PosCostCategoryWeightedMeta
}

type CategoryOrderRow = {
  order_type?: string
  items_json?: string
  total?: number
  discount_amt?: number
  coupon_discount_amt?: number
  service_amt?: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctOf(part: number, whole: number): number {
  if (whole <= 0.0001) return 0
  return round2((part / whole) * 100)
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

function parseOrderItems(itemsJson: string | undefined): Record<string, unknown>[] {
  if (!itemsJson) return []
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}

function isLineCancelled(row: Record<string, unknown>): boolean {
  return Boolean(str(row.cancelledAt ?? row.cancelled_at))
}

function resolveLineSales(row: Record<string, unknown>, qty: number): number {
  const price = Number(row.price ?? 0) || 0
  const discount = Math.max(0, Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0)
  return Math.max(0, qty * price - discount)
}

function resolveLineDiscountAmt(row: Record<string, unknown>): number {
  return Math.max(0, Number(row.lineDiscountAmt ?? row.line_discount_amt ?? 0) || 0)
}

function buildMenuCategoryById(menus: PosMenuCatalogRow[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of menus) {
    const id = str(m.id)
    if (!id) continue
    const cat = str(m.category_main) || str(m.category) || EMPTY_MAIN
    out.set(id, cat || EMPTY_MAIN)
  }
  return out
}

function lookupCostEntry(
  costIndex: Map<string, PosMenuCostIndexEntry>,
  menuId: string,
  optionId: string
): PosMenuCostIndexEntry | undefined {
  const keyWithOpt = `${menuId}|${optionId}`
  const keyBase = `${menuId}|`
  return costIndex.get(keyWithOpt) ?? costIndex.get(keyBase)
}

function resolveCategoryForMenu(
  menuId: string,
  row: Record<string, unknown>,
  categoryByMenuId: Map<string, string>
): string {
  const fromRow = str(row.category_main ?? row.categoryMain)
  if (fromRow) return fromRow
  if (menuId) {
    const hit = categoryByMenuId.get(menuId)
    if (hit) return hit
  }
  return EMPTY_MAIN
}

function catalogRegularWeight(params: {
  menuId: string
  optionId: string
  qty: number
  channel: RegularPriceChannel
  catalog?: Pick<PromoPricingCatalog, 'menus' | 'optionsByMenuId'>
}): number {
  const qty = Math.max(0, params.qty)
  if (qty <= 0 || !params.menuId || !params.catalog?.menus?.length) return 0
  const unit = calcRegularPriceSum({
    items: [{ menuId: params.menuId, optionId: params.optionId || null, quantity: 1 }],
    menus: params.catalog.menus,
    optionsByMenuId: params.catalog.optionsByMenuId ?? {},
    channel: params.channel,
  })
  return Math.max(0, unit) * qty
}

type Bucket = {
  netSales: number
  foodCost: number
  packagingCost: number
  matchedQty: number
  unmatchedQty: number
}

function emptyBucket(): Bucket {
  return {
    netSales: 0,
    foodCost: 0,
    packagingCost: 0,
    matchedQty: 0,
    unmatchedQty: 0,
  }
}

function upsertBucket(map: Map<string, Bucket>, categoryMain: string): Bucket {
  const key = categoryMain || EMPTY_MAIN
  const prev = map.get(key)
  if (prev) return prev
  const next = emptyBucket()
  map.set(key, next)
  return next
}

function mergeBucket(target: Bucket, src: Bucket, salesFactor: number) {
  target.netSales = round2(target.netSales + src.netSales * salesFactor)
  target.foodCost = round2(target.foodCost + src.foodCost)
  target.packagingCost = round2(target.packagingCost + src.packagingCost)
  target.matchedQty = round2(target.matchedQty + src.matchedQty)
  target.unmatchedQty = round2(target.unmatchedQty + src.unmatchedQty)
}

/**
 * 대분류별 판매 가중 실적 원가율.
 * - 세트/프로모: 구성품 카탈로그 정가 비중으로 매출 배분(없으면 수량 비중)
 * - 결제·쿠폰(라인 할인 잔여분) + 서비스(컴프)를 주문 단위로 분모에 반영
 * - BOM 미매칭 라인의 매출·원가는 대분류 합계에서 제외
 */
export function aggregatePosCostWeightedByCategory(params: {
  orderRows: CategoryOrderRow[]
  menus: PosMenuCatalogRow[]
  costIndex: Map<string, PosMenuCostIndexEntry>
  catalog?: Pick<
    PromoPricingCatalog,
    | 'menus'
    | 'optionsByMenuId'
    | 'promoItemsByPromoId'
    | 'promoMetaById'
    | 'promoIdByMirrorMenuId'
  >
  miseRatePercent?: number
  resolveContext?: TheoreticalCostResolveContext
}): PosCostCategoryWeightedResult {
  const miseMult = 1 + (params.miseRatePercent ?? 3) / 100
  const categoryByMenuId = buildMenuCategoryById(params.menus)
  const resolveContext =
    params.resolveContext ??
    buildTheoreticalCostResolveContext({
      costIndex: params.costIndex,
      catalog: params.catalog,
    })

  const globalBuckets = new Map<string, Bucket>()
  const meta: PosCostCategoryWeightedMeta = {
    excludedUnmatchedSales: 0,
    excludedUnmatchedQty: 0,
    paymentDiscountAllocated: 0,
    serviceAmtAllocated: 0,
  }

  for (const order of params.orderRows) {
    const isDelivery = isDeliveryChannelOrderType(order.order_type)
    const channel = orderTypeToPromoRegularPriceChannel(order.order_type)
    const orderBuckets = new Map<string, Bucket>()
    let lineDiscountSum = 0

    for (const row of parseOrderItems(order.items_json)) {
      if (isLineCancelled(row)) continue
      const parentQty = Math.max(0, resolveItemsJsonLineQty(row))
      if (parentQty <= 0) continue

      lineDiscountSum = round2(lineDiscountSum + resolveLineDiscountAmt(row))
      const parentSales = resolveLineSales(row, parentQty)
      const costLines = expandOrderLineToCostLines(row, resolveContext)
      if (costLines.length === 0) continue

      type Prepared = {
        menuId: string
        optionId: string
        qty: number
        categoryMain: string
        entry: PosMenuCostIndexEntry | undefined
        weight: number
      }

      const prepared: Prepared[] = []
      for (const line of costLines) {
        const qty = Math.max(0, line.qty)
        if (qty <= 0) continue
        const menuId = str(line.menuId)
        const optionId = str(line.optionId)
        const entry = menuId ? lookupCostEntry(params.costIndex, menuId, optionId) : undefined
        const catalogWeight = catalogRegularWeight({
          menuId,
          optionId,
          qty,
          channel,
          catalog: params.catalog,
        })
        prepared.push({
          menuId,
          optionId,
          qty,
          categoryMain: resolveCategoryForMenu(menuId, row, categoryByMenuId),
          entry,
          weight: catalogWeight > 0.0001 ? catalogWeight : qty,
        })
      }
      if (prepared.length === 0) continue

      const matched = prepared.filter((p) => p.entry)
      const unmatched = prepared.filter((p) => !p.entry)
      const weightAll = prepared.reduce((s, p) => s + p.weight, 0)
      const weightMatched = matched.reduce((s, p) => s + p.weight, 0)
      const weightUnmatched = unmatched.reduce((s, p) => s + p.weight, 0)

      const unmatchedQty = round2(unmatched.reduce((s, p) => s + p.qty, 0))
      if (unmatchedQty > 0) {
        meta.excludedUnmatchedQty = round2(meta.excludedUnmatchedQty + unmatchedQty)
        // 대분류별 unmatched 수량만 표시용으로 남김(매출·원가 없음)
        for (const p of unmatched) {
          const bucket = upsertBucket(orderBuckets, p.categoryMain)
          bucket.unmatchedQty = round2(bucket.unmatchedQty + p.qty)
        }
      }

      if (weightAll <= 0.0001) continue

      const excludedSales = round2(parentSales * (weightUnmatched / weightAll))
      if (excludedSales > 0.0001) {
        meta.excludedUnmatchedSales = round2(meta.excludedUnmatchedSales + excludedSales)
      }

      if (matched.length === 0 || weightMatched <= 0.0001) continue

      const matchedSalesPool = round2(parentSales * (weightMatched / weightAll))
      for (const p of matched) {
        const entry = p.entry!
        const share = (matchedSalesPool * p.weight) / weightMatched
        const bucket = upsertBucket(orderBuckets, p.categoryMain)
        bucket.netSales = round2(bucket.netSales + share)
        bucket.matchedQty = round2(bucket.matchedQty + p.qty)
        const unitFood = entry.foodCost * miseMult
        const unitPack = entry.packagingCost * miseMult
        bucket.foodCost = round2(bucket.foodCost + unitFood * p.qty)
        if (isDelivery) {
          bucket.packagingCost = round2(bucket.packagingCost + unitPack * p.qty)
        }
      }
    }

    const provisionalSales = round2(
      Array.from(orderBuckets.values()).reduce((s, b) => s + b.netSales, 0)
    )
    const headerDisc = resolvePosSalesDiscountAmount(
      Number(order.discount_amt) || 0,
      Number(order.coupon_discount_amt) || 0
    )
    const residualPaymentDisc = Math.max(0, round2(headerDisc - lineDiscountSum))
    const serviceAmt = Math.max(0, Number(order.service_amt) || 0)
    const reduction = Math.min(provisionalSales, round2(residualPaymentDisc + serviceAmt))

    let salesFactor = 1
    if (provisionalSales > 0.0001 && reduction > 0.0001) {
      salesFactor = Math.max(0, (provisionalSales - reduction) / provisionalSales)
      const paymentPart = Math.min(residualPaymentDisc, reduction)
      const servicePart = Math.max(0, round2(reduction - paymentPart))
      meta.paymentDiscountAllocated = round2(meta.paymentDiscountAllocated + paymentPart)
      meta.serviceAmtAllocated = round2(meta.serviceAmtAllocated + servicePart)
    }

    for (const [cat, bucket] of orderBuckets) {
      mergeBucket(upsertBucket(globalBuckets, cat), bucket, salesFactor)
    }
  }

  const rows = Array.from(globalBuckets.entries())
    .map(([categoryMain, b]) => {
      const totalCost = round2(b.foodCost + b.packagingCost)
      return {
        categoryMain,
        netSales: round2(b.netSales),
        totalCost,
        foodCost: b.foodCost,
        packagingCost: b.packagingCost,
        costPctOfNet: pctOf(totalCost, b.netSales),
        matchedQty: b.matchedQty,
        unmatchedQty: b.unmatchedQty,
      }
    })
    .filter((r) => r.netSales > 0 || r.totalCost > 0)
    .sort((a, b) => b.netSales - a.netSales || a.categoryMain.localeCompare(b.categoryMain, 'ko'))

  return { rows, meta }
}
