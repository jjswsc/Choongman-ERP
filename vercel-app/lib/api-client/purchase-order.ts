/**
 * 본사 발주 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { getPurchaseOrdersWithCache, getVendorsForPurchaseWithCache, getVendorsForSalesWithCache } from '../offline/erp-offline'
import { jsonAsArray } from '../safe-api-json'

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
  return getVendorsForPurchaseWithCache()
}

export async function getVendorsForSales() {
  return getVendorsForSalesWithCache()
}

/** 회계 PO·로열티 청구: 매출처(가맹 법인) 전체 필드 — getVendorsForPurchase에는 매출처가 없음 */
export async function getVendorsForSalesFranchiseMaster(): Promise<VendorForPurchase[]> {
  const res = await apiFetch('/api/getVendorsForSales?detail=1')
  if (!res.ok) return []
  const data = (await res.json()) as unknown
  return Array.isArray(data) ? (data as VendorForPurchase[]) : []
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

export type PoBillingSettingApiRow = {
  store_name?: string
  royalty_pct?: number
  delivery_gp_pct?: number
  grab_gp_pct?: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
  updated_at?: string
}

export async function getPoBillingSettings() {
  const res = await apiFetch('/api/getPoBillingSettings')
  return res.json() as Promise<{ success: boolean; list: PoBillingSettingApiRow[]; message?: string }>
}

export async function savePoBillingSettings(
  rows: {
    store_name: string
    royalty_pct: number
    delivery_gp_pct: number
    grab_gp_pct: number
    label_royalty?: string | null
    label_delivery_gp?: string | null
    label_grab_gp?: string | null
  }[]
): Promise<{ success: boolean; saved?: number; message?: string }> {
  // 오프라인 래퍼(apiFetchWithOffline)는 실패 시에도 { success: true }를 반환할 수 있어,
  // 청구 비율은 반드시 서버·DB 반영 여부를 알 수 있게 일반 fetch만 사용한다.
  const res = await apiFetch('/api/savePoBillingSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  })
  let data: { success?: boolean; saved?: number; message?: string } = {}
  try {
    data = (await res.json()) as typeof data
  } catch {
    /* empty body 등 */
  }
  if (!res.ok) {
    return {
      success: false,
      message: data.message || `저장 요청 실패 (${res.status})`,
    }
  }
  return {
    success: !!data.success,
    saved: data.saved,
    message: data.message,
  }
}

export async function getPoBillingDraft(params: {
  store: string
  startStr: string
  endStr: string
  labelRoyalty?: string
  labelDelivery?: string
  labelGrab?: string
  /** 기본 all — royalty | delivery_gp | grab_gp 는 해당 유형만 */
  mode?: 'all' | 'royalty' | 'delivery_gp' | 'grab_gp'
}) {
  const q = new URLSearchParams({
    store: params.store,
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.labelRoyalty) q.set('labelRoyalty', params.labelRoyalty)
  if (params.labelDelivery) q.set('labelDelivery', params.labelDelivery)
  if (params.labelGrab) q.set('labelGrab', params.labelGrab)
  if (params.mode && params.mode !== 'all') q.set('mode', params.mode)
  const res = await apiFetch(`/api/getPoBillingDraft?${q}`)
  return res.json() as Promise<{
    success: boolean
    snapshot?: { totalSales: number; deliverySales: number; grabSales: number }
    settings?: { royalty_pct: number; delivery_gp_pct: number; grab_gp_pct: number }
    lines?: { code: string; name: string; price: number; qty: number; taxType: string }[]
    truncated?: boolean
    message?: string
  }>
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

export type CompanyHybridDocumentListItem = {
  id: number
  store: string
  related_type: string
  related_id: string | null
  doc_type: string | null
  category_id: number | null
  title: string
  source: string
  external_url: string | null
  public_url: string | null
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  mime: string | null
  valid_from: string | null
  valid_to: string | null
  note: string | null
  metadata?: Record<string, unknown> | null
  created_by_name: string | null
  created_by_store: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CompanyHybridDocumentCategory = {
  id: number
  store: string
  name: string
  sort_order: number
  parent_category_id: number | null
  created_at?: string
}

/** 문서 관리 API: UI에서 401 시 알림 대신 로그인 이동용 */
type CompanyHybridHttpMeta = { httpStatus: number }

export type CompanyHybridDocumentEvent = {
  id: number
  document_id: number
  action: string
  store: string
  actor_name: string | null
  actor_store: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export type CompanyHybridDocumentsSummary = {
  today: string
  total: number
  expiring_soon: number
  expired: number
  corr_overdue: number
  stores: Array<{
    store: string
    total: number
    expiring_soon: number
    expired: number
    compliance_pct: number
  }>
}

export async function getCompanyHybridDocuments(params: {
  store: string
  relatedType?: string
  relatedId?: string
  /** 생략·'all' = 전체, 'uncategorized' = 미분류, 숫자 문자열 = 해당 카테고리 */
  categoryId?: string
  searchTitle?: string
  /** 제목 정렬 — 미지정 시 등록일 최신순 */
  sortTitle?: 'asc' | 'desc'
  sortCreated?: 'asc' | 'desc'
  sortValidTo?: 'asc' | 'desc'
  /** 공문(metadata.correspondence) 유무: all | yes | no */
  corrPresence?: 'all' | 'yes' | 'no'
  corrDirection?: 'outbound' | 'inbound'
  corrStatus?: 'draft' | 'sent' | 'filed' | 'replied'
  corrCounterpartySearch?: string
  sourceFilter?: 'drive' | 'supabase'
  visibilityFilter?: 'all' | 'office' | 'store_admin'
  expiryFilter?: 'all' | 'expiring_soon' | 'expired' | 'no_expiry'
  offset?: number
  limit?: number
}): Promise<
  {
    success: boolean
    list: CompanyHybridDocumentListItem[]
    total?: number
    offset?: number
    limit?: number
    truncated?: boolean
    message?: string
  } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ store: params.store })
  if (params.relatedType) q.set('relatedType', params.relatedType)
  if (params.relatedId) q.set('relatedId', params.relatedId)
  if (params.categoryId && params.categoryId !== 'all') {
    const c = params.categoryId
    q.set('categoryId', c === 'uncategorized' ? 'none' : c)
  }
  if (params.searchTitle?.trim()) q.set('searchTitle', params.searchTitle.trim())
  if (params.sortTitle === 'asc' || params.sortTitle === 'desc') q.set('sortTitle', params.sortTitle)
  if (params.sortCreated === 'asc' || params.sortCreated === 'desc') q.set('sortCreated', params.sortCreated)
  if (params.sortValidTo === 'asc' || params.sortValidTo === 'desc') q.set('sortValidTo', params.sortValidTo)
  if (params.corrPresence && params.corrPresence !== 'all') q.set('corrPresence', params.corrPresence)
  if (params.corrDirection) q.set('corrDirection', params.corrDirection)
  if (params.corrStatus) q.set('corrStatus', params.corrStatus)
  if (params.corrCounterpartySearch?.trim()) q.set('corrCounterpartySearch', params.corrCounterpartySearch.trim())
  if (params.sourceFilter === 'drive' || params.sourceFilter === 'supabase') q.set('source', params.sourceFilter)
  if (params.visibilityFilter && params.visibilityFilter !== 'all') q.set('visibility', params.visibilityFilter)
  if (params.expiryFilter && params.expiryFilter !== 'all') q.set('expiryFilter', params.expiryFilter)
  if (params.offset != null && params.offset >= 0) q.set('offset', String(Math.floor(params.offset)))
  if (params.limit != null && params.limit > 0) q.set('limit', String(Math.floor(params.limit)))
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocuments?${q}`)
  const data = (await res.json()) as {
    success: boolean
    list: CompanyHybridDocumentListItem[]
    total?: number
    offset?: number
    limit?: number
    truncated?: boolean
    message?: string
  }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentCategories(params: {
  store: string
}): Promise<
  { success: boolean; list: CompanyHybridDocumentCategory[]; message?: string } & CompanyHybridHttpMeta
> {
  const res = await apiFetchWithOffline(
    `/api/getCompanyHybridDocumentCategories?${new URLSearchParams({ store: params.store })}`
  )
  const data = (await res.json()) as { success: boolean; list: CompanyHybridDocumentCategory[]; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function saveCompanyHybridDocumentCategory(
  body: { store: string; name: string; sortOrder?: number; id?: number; parentCategoryId?: number | null }
): Promise<{ success: boolean; id?: number; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/saveCompanyHybridDocumentCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function deleteCompanyHybridDocumentCategory(
  body: { id: number }
): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/deleteCompanyHybridDocumentCategory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function saveCompanyHybridDocument(
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: number; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/saveCompanyHybridDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function deleteCompanyHybridDocument(params: {
  id: number
}): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/deleteCompanyHybridDocument', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function presignCompanyHybridDocumentUpload(params: {
  store: string
  fileName: string
  contentType: string
  fileSize: number
}): Promise<
  {
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  } & CompanyHybridHttpMeta
> {
  const res = await apiFetchWithOffline('/api/uploadCompanyHybridDocument/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    success: boolean
    signedUrl?: string
    publicUrl?: string
    storagePath?: string
    message?: string
  }
  return { ...data, httpStatus: res.status }
}

export async function completeCompanyHybridDocumentUpload(
  body: Record<string, unknown>
): Promise<{ success: boolean; id?: number; url?: string; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/uploadCompanyHybridDocument/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as { success: boolean; id?: number; url?: string; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function recordCompanyHybridDocumentView(params: {
  id: number
}): Promise<{ success: boolean; message?: string } & CompanyHybridHttpMeta> {
  const res = await apiFetchWithOffline('/api/recordCompanyHybridDocumentView', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success: boolean; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentEvents(params: {
  documentId: number
}): Promise<
  { success: boolean; list: CompanyHybridDocumentEvent[]; message?: string } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ documentId: String(params.documentId) })
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocumentEvents?${q}`)
  const data = (await res.json()) as { success: boolean; list: CompanyHybridDocumentEvent[]; message?: string }
  return { ...data, httpStatus: res.status }
}

export async function getCompanyHybridDocumentsSummary(params: {
  store: string
}): Promise<
  { success: boolean; summary?: CompanyHybridDocumentsSummary; message?: string } & CompanyHybridHttpMeta
> {
  const q = new URLSearchParams({ store: params.store })
  const res = await apiFetchWithOffline(`/api/getCompanyHybridDocumentsSummary?${q}`)
  const data = (await res.json()) as {
    success: boolean
    summary?: CompanyHybridDocumentsSummary
    message?: string
  }
  return { ...data, httpStatus: res.status }
}
