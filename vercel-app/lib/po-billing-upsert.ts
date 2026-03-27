/**
 * 매장 월별 청구 PO(로얄티·GP) — 동일 키의 초안(Draft)이 있으면 갱신 대상으로 찾기
 */
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { parsePurchaseOrderCart, type PoBillingKind, type PoCartMeta } from '@/lib/purchase-order-cart'

export function normalizeBillingMonthYm(s: string): string {
  return String(s || '')
    .trim()
    .slice(0, 7)
}

export function parsePoBillingKindFromBody(raw: unknown): PoBillingKind | null {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
  if (s === 'royalty' || s === 'delivery_gp' || s === 'grab_gp' || s === 'all') return s
  return null
}

export async function findDraftPurchaseOrderForBillingUpsert(params: {
  vendorCode: string
  locationCode: string
  relatedStore: string
  billingMonthYm: string
  billingKind: PoBillingKind
}): Promise<{ id: number; po_no: string } | null> {
  const ym = normalizeBillingMonthYm(params.billingMonthYm)
  if (ym.length !== 7) return null
  const filter = [
    `vendor_code=eq.${encodeURIComponent(params.vendorCode)}`,
    `location_code=eq.${encodeURIComponent(params.locationCode)}`,
    `status=eq.Draft`,
  ].join('&')
  const rows = (await supabaseSelectFilter('purchase_orders', filter, {
    limit: 500,
    order: 'created_at.desc',
    select: 'id,po_no,cart_json',
  })) as { id?: number; po_no?: string; cart_json?: string }[]
  const storeWant = String(params.relatedStore).trim()
  for (const r of rows) {
    if (r.id == null) continue
    const { meta } = parsePurchaseOrderCart(r.cart_json)
    if (!meta) continue
    if (String(meta.relatedStore || '').trim() !== storeWant) continue
    if (normalizeBillingMonthYm(String(meta.billingMonthYm || '')) !== ym) continue
    if ((meta as PoCartMeta).billingKind !== params.billingKind) continue
    return { id: Number(r.id), po_no: String(r.po_no || '') }
  }
  return null
}
