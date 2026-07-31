/**
 * purchase_orders.cart_json — 배열(레거시) 또는 { v:1, items, meta } (회계 PO 확장)
 */

import { roundMoney2 } from "@/lib/invoice-vat-total"

export type PoCartLine = {
  code?: string
  name?: string
  price?: number
  qty?: number
  store?: string
  taxType?: string
  spec?: string
}

/** 발주 줄 VAT 면세 여부 — `savePurchaseOrder`·화면 합계와 동일 규칙 */
export function poLineIsVatExempt(taxType?: string | null): boolean {
  const t = String(taxType ?? '').trim()
  return t === 'exempt' || t === '면세' || t === '영세율' || t === 'zero'
}

/**
 * 태국 7% VAT: 과세 줄 합계에만 VAT 적용(줄 금액 2자리 → 소계 → VAT round → 합계).
 * `savePurchaseOrder`와 동일한 금액 규칙.
 * VAT포함 단가 환산(`vatExclusiveUnitFromInclusiveUnit`) 후 줄합이 FlowAccount와 맞도록 줄 금액을 2자리로 고정.
 */
export function computePurchaseOrderMoneyTotals(items: PoCartLine[]): {
  subtotal: number
  taxableSubtotal: number
  vat: number
  total: number
} {
  let subtotal = 0
  let taxableSubtotal = 0
  for (const c of items) {
    const price = Number(c.price ?? (c as { cost?: number }).cost ?? 0)
    const qty = Number(c.qty || 0)
    const amt = roundMoney2(price * qty)
    subtotal = roundMoney2(subtotal + amt)
    if (!poLineIsVatExempt(c.taxType)) taxableSubtotal = roundMoney2(taxableSubtotal + amt)
  }
  const vat = roundMoney2(taxableSubtotal * 0.07)
  const total = roundMoney2(subtotal + vat)
  return { subtotal, taxableSubtotal, vat, total }
}

/** body/meta에서 온 수동 보정값 검증·정규화. 유효하지 않으면 null */
export function normalizePoMoneyOverride(raw: unknown): PoMoneyOverride | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const subtotal = Number(o.subtotal)
  const vat = Number(o.vat)
  const total = Number(o.total)
  if (![subtotal, vat, total].every((n) => Number.isFinite(n) && n >= 0)) return null
  const s = roundMoney2(subtotal)
  const v = roundMoney2(vat)
  const t = roundMoney2(total)
  // 소계+VAT ≈ 합계 (0.02 허용 — 외부 문서 반올림 잔차)
  if (Math.abs(roundMoney2(s + v) - t) > 0.02) return null
  return { subtotal: s, vat: v, total: t }
}

/**
 * 라인 계산값에 moneyOverride가 있으면 소계·VAT·합계만 교체.
 * taxableSubtotal은 항상 라인 기준(원천징수 참고용).
 */
export function resolvePurchaseOrderMoneyTotals(
  items: PoCartLine[],
  moneyOverride?: PoMoneyOverride | null
): {
  subtotal: number
  taxableSubtotal: number
  vat: number
  total: number
  overridden: boolean
} {
  const computed = computePurchaseOrderMoneyTotals(items)
  const ov = normalizePoMoneyOverride(moneyOverride ?? null)
  if (!ov) return { ...computed, overridden: false }
  return {
    subtotal: ov.subtotal,
    taxableSubtotal: computed.taxableSubtotal,
    vat: ov.vat,
    total: ov.total,
    overridden: true,
  }
}

export type PoBillingKind = "royalty" | "delivery_gp" | "grab_gp" | "all"

/** FlowAccount 등 외부 문서와 소수점 차이를 맞추기 위한 합계 수동 보정 */
export type PoMoneyOverride = {
  subtotal: number
  vat: number
  total: number
}

export type PoCartMeta = {
  /** 청구 발행 매장 — 없으면 본사 발행(레거시) */
  issuerStore?: string
  relatedStore?: string
  storeVendorCode?: string
  storeVendorName?: string
  poFormatLabel?: string
  /** 귀속 월 YYYY-MM — 매장 청구 PO 월 1회·갱신 키 */
  billingMonthYm?: string
  /** 로얄티·배달 GP·Grab GP 단일 또는 전체(all) */
  billingKind?: PoBillingKind
  /** 본사(회계) 발주일 YYYY-MM-DD — 방콕 달력 */
  orderDate?: string
  /** 세금계산서·내부 문서 참조번호 */
  referenceNo?: string
  /** 공급사 견적/제안서 (Supabase Storage public URL) */
  quotationFileUrl?: string
  /** 첨부 파일명(표시용) */
  quotationFileName?: string
  /** 라인 자동계산 대신 저장·표시에 쓰는 소계·VAT·합계 */
  moneyOverride?: PoMoneyOverride
}

export type PoCartPayloadV1 = {
  v: 1
  items: PoCartLine[]
  meta?: PoCartMeta
}

function isNonEmptyMeta(m?: PoCartMeta): boolean {
  if (!m || typeof m !== "object") return false
  if (String(m.billingMonthYm ?? "").trim() && String(m.billingKind ?? "").trim()) return true
  if (normalizePoMoneyOverride(m.moneyOverride)) return true
  return Object.values(m).some((v) => {
    if (v != null && typeof v === "object") return false
    return String(v ?? "").trim().length > 0
  })
}

/** 저장용: 메타가 있으면 v1 래퍼, 없으면 순수 배열(하위 호환) */
export function serializePurchaseOrderCart(items: PoCartLine[], meta?: PoCartMeta): string {
  const lines = Array.isArray(items) ? items : []
  if (isNonEmptyMeta(meta)) {
    return JSON.stringify({ v: 1, items: lines, meta } satisfies PoCartPayloadV1)
  }
  return JSON.stringify(lines)
}

/**
 * API/PostgREST에서 json/jsonb 컬럼이 객체로 오거나(일반), text로 쌓인 행이 문자열로 올 수 있음.
 * 둘 다 동일 파서로 처리해야 견적 URL 등 meta를 읽을 수 있음.
 */
function toParsedCartJson(raw: unknown): unknown {
  if (raw == null) return null
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t) return null
    try {
      return JSON.parse(t) as unknown
    } catch {
      return null
    }
  }
  if (typeof raw === "object") return raw
  return null
}

export function parsePurchaseOrderCart(json: unknown): { items: PoCartLine[]; meta?: PoCartMeta } {
  const parsed = toParsedCartJson(json)
  if (parsed == null) return { items: [] }
  if (Array.isArray(parsed)) {
    return { items: parsed as PoCartLine[] }
  }
  if (parsed && typeof parsed === "object" && "items" in parsed && Array.isArray((parsed as PoCartPayloadV1).items)) {
    const p = parsed as PoCartPayloadV1
    return { items: p.items || [], meta: p.meta }
  }
  return { items: [] }
}

/** cart_json 메타의 발주일(YYYY-MM-DD). 없으면 null */
export function purchaseOrderMetaOrderDate(cartJson: unknown): string | null {
  const { meta } = parsePurchaseOrderCart(cartJson)
  const s = String(meta?.orderDate ?? "").trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** cart_json 메타에 저장된 견적서 첨부 (없으면 빈 객체) */
export function poQuotationFromMeta(cartJson: unknown): { url: string; name: string } | null {
  const { meta } = parsePurchaseOrderCart(cartJson)
  const url = String(meta?.quotationFileUrl ?? "").trim()
  if (!url) return null
  const name = String(meta?.quotationFileName ?? "").trim() || "quotation"
  return { url, name }
}

/**
 * 회계(본사 PO·POS 청구 등) vs 물류(매장 발주 등) 구분.
 * `savePurchaseOrder`에서 회계 전용 메타(orderDate, billing*, relatedStore)가 있으면 회계.
 * 순수 JSON 배열 또는 메타 없음은 물류(레거시 매장 발주)로 본다.
 */
export function isAccountingPurchaseOrderByCartJson(cartJson: unknown): boolean {
  const { meta } = parsePurchaseOrderCart(cartJson)
  if (!meta) return false
  if (purchaseOrderMetaOrderDate(cartJson)) return true
  const ym = String(meta.billingMonthYm ?? "").trim()
  const bk = String(meta.billingKind ?? "").trim()
  if (ym.length === 7 && bk) return true
  if (String(meta.relatedStore ?? "").trim()) return true
  if (String(meta.issuerStore ?? "").trim()) return true
  return false
}

/** 회계 PO 청구 발행 주체 — 없으면 본사 */
export function resolveAccountingPoIssuerStore(po: { cart_json?: unknown }): string | null {
  const { meta } = parsePurchaseOrderCart(po.cart_json)
  const issuer = String(meta?.issuerStore ?? "").trim()
  return issuer || null
}

/** 목록·보내기용: meta.orderDate 우선, 없으면 created_at — 표시는 Asia/Bangkok */
export function formatPoDisplayDate(
  po: { cart_json?: unknown; created_at?: string },
  locale: string
): string {
  const metaYmd = purchaseOrderMetaOrderDate(po.cart_json)
  if (metaYmd) {
    const [y, m, d] = metaYmd.split("-").map((x) => parseInt(x, 10))
    if (y && m && d) {
      const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0)
      try {
        return new Intl.DateTimeFormat(locale, {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(utcNoon))
      } catch {
        return metaYmd
      }
    }
  }
  const raw = String(po.created_at ?? "").trim()
  if (raw) {
    const dt = new Date(raw)
    if (!Number.isNaN(dt.getTime())) {
      try {
        return new Intl.DateTimeFormat(locale, {
          timeZone: "Asia/Bangkok",
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(dt)
      } catch {
        return raw.slice(0, 10)
      }
    }
  }
  return "-"
}

/**
 * 회계 PO 승인 → 미수금 귀속 매장명.
 * meta.relatedStore → 품목 줄 store → 발주 수령처(location_name)
 */
export function resolveAccountingPoReceivableStoreName(po: { cart_json?: unknown; location_name?: string }): string {
  const { meta, items } = parsePurchaseOrderCart(po.cart_json)
  const fromMeta = String(meta?.relatedStore ?? "").trim()
  if (fromMeta) return fromMeta
  const fromLine = items.map((i) => String(i.store ?? "").trim()).find(Boolean)
  if (fromLine) return fromLine
  return String(po.location_name ?? "").trim()
}
