/**
 * 본사 발주·매장 권한 API — purchase-order.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getPurchaseOrdersWithCache, getVendorsForPurchaseWithCache, getVendorsForSalesWithCache } from '../offline/erp-offline'
import { jsonAsArray } from '../safe-api-json'
import { sortVendorsByDisplayName } from '../vendor-sort'

export interface PurchaseLocation {
  name: string
  address: string
  location_code: string
}

export interface VendorForPurchase {
  code: string
  name: string
  address?: string
  taxId?: string
  phone?: string
  bankAccountNo?: string | null
  salesOutlet?: string | null
  /** vendors.gps_name — 매장 표시명, 회계 PO 매장-법인 매칭용 */
  gpsName?: string | null
}

export interface ItemByVendor {
  code: string
  name: string
  spec: string
  price: number
  cost: number
  category: string
  image: string
  outbound_location?: string
  taxType?: 'taxable' | 'exempt' | 'zero'
}

export async function getPurchaseLocations() {
  const res = await apiFetchWithOffline('/api/getPurchaseLocations')
  return jsonAsArray<PurchaseLocation>(await res.json())
}

export async function getVendorsForPurchase() {
  return sortVendorsByDisplayName(await getVendorsForPurchaseWithCache())
}

export async function getVendorsForSales() {
  return sortVendorsByDisplayName(await getVendorsForSalesWithCache())
}

/** 회계 PO·로열티 청구: 매출처(가맹 법인) 전체 필드 — getVendorsForPurchase에는 매출처가 없음 */
export async function getVendorsForSalesFranchiseMaster(): Promise<VendorForPurchase[]> {
  const res = await apiFetch('/api/getVendorsForSales?detail=1')
  if (!res.ok) return []
  const data = (await res.json()) as unknown
  return sortVendorsByDisplayName(Array.isArray(data) ? (data as VendorForPurchase[]) : [])
}

export async function getItemsByVendor(
  vendorCode: string,
  vendorName?: string,
  outboundLocation?: string,
  /** 출고지 표시명 — 품목에 code 대신 name이 저장된 경우 매칭용 */
  outboundLocationName?: string
) {
  const q = new URLSearchParams({ vendorCode })
  if (vendorName?.trim()) q.set('vendorName', vendorName.trim())
  if (outboundLocation?.trim()) q.set('outboundLocation', outboundLocation.trim())
  if (outboundLocationName?.trim()) q.set('outboundLocationName', outboundLocationName.trim())
  const res = await apiFetchWithOffline(`/api/getItemsByVendor?${q}`)
  return jsonAsArray<ItemByVendor>(await res.json())
}

export interface ItemVendorRow {
  vendorCode: string
  priority?: number
  unitPrice?: number | null
  minOrderQty?: number | null
  memo?: string | null
}

export async function getItemVendors(itemCode: string) {
  const q = new URLSearchParams({ itemCode })
  const res = await apiFetchWithOffline(`/api/getItemVendors?${q}`)
  return jsonAsArray<ItemVendorRow>(await res.json())
}

export async function saveItemVendors(params: {
  itemCode: string
  vendors: { vendorCode: string; priority?: number; unitPrice?: number | null; minOrderQty?: number | null; memo?: string | null }[]
}) {
  const res = await apiFetchWithOffline('/api/saveItemVendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getHqStockByLocation(locationCode: string) {
  const q = new URLSearchParams({ locationCode })
  const res = await apiFetchWithOffline(`/api/getHqStockByLocation?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function savePurchaseOrder(params: {
  vendorCode: string
  vendorName: string
  locationName: string
  locationAddress: string
  locationCode: string
  cart: { code: string; name: string; price: number; cost?: number; qty: number; store?: string; taxType?: string }[]
  userName: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
  relatedStore?: string
  storeVendorCode?: string
  storeVendorName?: string
  poFormatLabel?: string
  /** 귀속 월 YYYY-MM + billingKind 있으면 동일 초안 PO가 있으면 갱신 */
  billingMonthYm?: string
  billingKind?: 'royalty' | 'delivery_gp' | 'grab_gp' | 'all'
  /** 본사 발주일 YYYY-MM-DD(방콕). cart_json meta + created_at·PO번호 일자 반영 */
  orderDate?: string
  /** 세금계산서·내부 참조번호 — cart_json meta */
  referenceNo?: string
  /** 공급사 견적/제안서 — cart_json meta (public URL) */
  quotationFileUrl?: string
  quotationFileName?: string
}) {
  const res = await apiFetchWithOffline('/api/savePurchaseOrder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    id?: number
    poNo?: string
    updated?: boolean
    message?: string
  }>
}

/** 본사 PO 견적서: presign 후 Supabase Storage에 직접 PUT */
export async function uploadPoQuotationFile(params: { file: File }) {
  const { apiFetch } = await import('../api/fetch')
  const pres = await apiFetch('/api/uploadPoQuotation/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: params.file.name,
      contentType: params.file.type || 'application/octet-stream',
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, publicUrl: undefined, message: pjson.message || '업로드 준비 실패' }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, params.file, { upsert: true })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, publicUrl: undefined, message: t || `Storage 업로드 실패 (${putRes.status})` }
  }
  return { success: true, publicUrl: pjson.publicUrl, message: undefined }
}

export interface PurchaseOrderRow {
  id?: number
  po_no?: string
  vendor_code?: string
  vendor_name?: string
  location_name?: string
  location_address?: string
  location_code?: string
  cart_json?: string
  subtotal?: number
  vat?: number
  total?: number
  user_name?: string
  status?: string
  created_at?: string
  withholding_tax_amount?: number
  withholding_tax_rate?: number
  invoice_received?: boolean
  invoice_no?: string
}

export async function getPurchaseOrders(params?: {
  vendorCode?: string
  poId?: number
  startDate?: string
  endDate?: string
}) {
  return getPurchaseOrdersWithCache(params) as Promise<PurchaseOrderRow[]>
}

export async function updatePurchaseOrderInvoice(params: {
  poId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  withholdingTaxAmount?: number
  withholdingTaxRate?: number
}) {
  const res = await apiFetchWithOffline('/api/updatePurchaseOrderInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processPurchaseOrderApproval(params: { poId: number }) {
  const res = await apiFetchWithOffline('/api/processPurchaseOrderApproval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function processPurchaseOrderCancel(params: { poId: number }) {
  const res = await apiFetchWithOffline('/api/processPurchaseOrderCancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function getMenuPermission(store: string, name: string) {
  const q = new URLSearchParams({ store, name })
  const res = await apiFetchWithOffline(`/api/getMenuPermission?${q}`)
  return res.json() as Promise<Record<string, number>>
}

export async function setMenuPermission(
  store: string,
  name: string,
  permissions: Record<string, number>
) {
  const res = await apiFetchWithOffline('/api/setMenuPermission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store, name, perm: permissions }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
