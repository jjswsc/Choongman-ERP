/**
 * purchase_orders.cart_json — 배열(레거시) 또는 { v:1, items, meta } (회계 PO 확장)
 */

export type PoCartLine = {
  code?: string
  name?: string
  price?: number
  qty?: number
  store?: string
  taxType?: string
  spec?: string
}

export type PoBillingKind = "royalty" | "delivery_gp" | "grab_gp" | "all"

export type PoCartMeta = {
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
}

export type PoCartPayloadV1 = {
  v: 1
  items: PoCartLine[]
  meta?: PoCartMeta
}

function isNonEmptyMeta(m?: PoCartMeta): boolean {
  if (!m || typeof m !== "object") return false
  if (String(m.billingMonthYm ?? "").trim() && String(m.billingKind ?? "").trim()) return true
  return Object.values(m).some((v) => String(v ?? "").trim().length > 0)
}

/** 저장용: 메타가 있으면 v1 래퍼, 없으면 순수 배열(하위 호환) */
export function serializePurchaseOrderCart(items: PoCartLine[], meta?: PoCartMeta): string {
  const lines = Array.isArray(items) ? items : []
  if (isNonEmptyMeta(meta)) {
    return JSON.stringify({ v: 1, items: lines, meta } satisfies PoCartPayloadV1)
  }
  return JSON.stringify(lines)
}

export function parsePurchaseOrderCart(json: string | undefined): { items: PoCartLine[]; meta?: PoCartMeta } {
  if (!json || typeof json !== "string") return { items: [] }
  try {
    const parsed = JSON.parse(json) as unknown
    if (Array.isArray(parsed)) {
      return { items: parsed as PoCartLine[] }
    }
    if (parsed && typeof parsed === "object" && "items" in parsed && Array.isArray((parsed as PoCartPayloadV1).items)) {
      const p = parsed as PoCartPayloadV1
      return { items: p.items || [], meta: p.meta }
    }
  } catch {
    /* ignore */
  }
  return { items: [] }
}

/** cart_json 메타의 발주일(YYYY-MM-DD). 없으면 null */
export function purchaseOrderMetaOrderDate(cartJson: string | undefined): string | null {
  const { meta } = parsePurchaseOrderCart(cartJson)
  const s = String(meta?.orderDate ?? "").trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/**
 * 회계(본사 PO·POS 청구 등) vs 물류(매장 발주 등) 구분.
 * `savePurchaseOrder`에서 회계 전용 메타(orderDate, billing*, relatedStore)가 있으면 회계.
 * 순수 JSON 배열 또는 메타 없음은 물류(레거시 매장 발주)로 본다.
 */
export function isAccountingPurchaseOrderByCartJson(cartJson: string | undefined): boolean {
  const { meta } = parsePurchaseOrderCart(cartJson)
  if (!meta) return false
  if (purchaseOrderMetaOrderDate(cartJson)) return true
  const ym = String(meta.billingMonthYm ?? "").trim()
  const bk = String(meta.billingKind ?? "").trim()
  if (ym.length === 7 && bk) return true
  if (String(meta.relatedStore ?? "").trim()) return true
  return false
}

/** 목록·보내기용: meta.orderDate 우선, 없으면 created_at — 표시는 Asia/Bangkok */
export function formatPoDisplayDate(
  po: { cart_json?: string; created_at?: string },
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
