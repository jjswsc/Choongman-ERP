/**
 * 배합(합성품) 원가 API (api-client.ts에서 분리 — move only)
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { setErpCache } from '../offline/cache'
import { notifyPosCatalogUpdated, posMenusCatalogCacheKey } from '../offline/pos-catalog-offline'
import type { PosMenuUpsertApiBody } from '../pos-menu-upsert-server'
import { parsePosMutationResponse } from './helpers'
import type { PosOptionSelectionGroupConfig } from './pos-menus'

export interface SauceRow {
  id?: number
  code: string
  name: string
  unit: string
  totalQuantity: number
  totalCost: number
  overheadPercent: number
  totalWithOverhead: number
  costPerUnit: number
  ingredients: { id?: number; itemCode: string; itemName: string; quantity: number; lossRate: number; costPerUnit: number; costTotal: number; unit: string }[]
  purchaseSource: 'hq' | 'store'
  /** 판매용: 계산기에서 배합 선택·품목 등록 프리필·연결 품목 필수. 매장용: 연결 없음·매장용 전용 추가 경로 */
  usageKind?: 'for_sale' | 'store_use'
  /** usageKind=for_sale 일 때 품목관리 items.code (필수). 매장용은 보통 비움 */
  linkedItemCode?: string
}

let warnedSaucesAnonEmpty = false

/** 읽기 전용: apiFetch 사용(인증·응답 형식 일관). 배열이 아닌 200 응답은 조용히 빈 목록으로 두지 않고 오류 처리 */
export async function getSauces() {
  const res = await apiFetch('/api/sauces')
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error((data as { message?: string })?.message || `배합 목록 조회 실패 (${res.status})`)
  }
  if (!Array.isArray(data)) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message?: unknown }).message)
        : `배합 API 응답이 배열이 아닙니다 (${typeof data})`
    throw new Error(msg)
  }
  if (
    data.length === 0 &&
    res.headers.get('X-CM-Supabase-Key-Mode') === 'anon' &&
    !warnedSaucesAnonEmpty
  ) {
    warnedSaucesAnonEmpty = true
    console.warn(
      '[getSauces] 배합 0건이고 서버가 anon 키 모드입니다. DB에 데이터가 있어도 RLS 때문에 안 보일 수 있습니다. Vercel/로컬에 SUPABASE_SERVICE_ROLE_KEY를 설정하거나 vercel-app/sql/sauces_rls_anon_read_optional.sql 을 참고하세요.'
    )
  }
  return data as SauceRow[]
}

export async function saveSauce(params: {
  id?: number
  code: string
  name: string
  unit?: string
  overheadPercent?: number
  totalQuantity?: number
  ingredients: { itemCode: string; quantity: number; lossRate?: number }[]
  usageKind?: 'for_sale' | 'store_use'
  linkedItemCode?: string
}) {
  const res = await apiFetchWithOffline('/api/sauces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; id?: number; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `저장 실패 (${res.status})`)
  }
  return data
}

export async function deleteSauce(params: { id: number }) {
  const res = await apiFetchWithOffline('/api/sauces/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `삭제 실패 (${res.status})`)
  }
  return data
}

export async function recalculateSauces() {
  const res = await apiFetchWithOffline('/api/sauces/recalculate', { method: 'POST' })
  const data = await res.json().catch(() => ({})) as {
    success?: boolean
    count?: number
    affectedMenuCount?: number
    message?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || `재계산 실패 (${res.status})`)
  }
  return data
}

export async function getNotificationSettings() {
  const res = await apiFetchWithOffline('/api/notificationSettings')
  return res.json() as Promise<{ pushNoticeEnabled: boolean; pushOrderApprovalEnabled: boolean }>
}

export async function updateNotificationSettings(params: {
  pushNoticeEnabled?: boolean
  pushOrderApprovalEnabled?: boolean
}) {
  const res = await apiFetchWithOffline('/api/notificationSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean }>
}

/** 급여 — 위험수당·평가등급 규칙 (system_settings) */
export async function getPayrollHazGradeRules() {
  const res = await apiFetchWithOffline('/api/payrollHazGradeRules')
  const data = (await res.json().catch(() => ({}))) as {
    requireEvalGrade?: boolean
    minEvalGrade?: string
    gradeOptions?: string[]
    canEdit?: boolean
    message?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || `급여 규칙 조회 실패 (${res.status})`)
  }
  return {
    requireEvalGrade: data.requireEvalGrade !== false,
    minEvalGrade: String(data.minEvalGrade || 'B').toUpperCase(),
    gradeOptions: Array.isArray(data.gradeOptions) ? data.gradeOptions : ['S', 'A', 'B', 'C', 'F'],
    canEdit: !!data.canEdit,
  }
}

export async function savePayrollHazGradeRules(params: { requireEvalGrade: boolean; minEvalGrade: string }) {
  const res = await apiFetchWithOffline('/api/payrollHazGradeRules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    requireEvalGrade?: boolean
    minEvalGrade?: string
  }>
}

export async function getCostSettings() {
  const res = await apiFetchWithOffline('/api/costSettings')
  const data = await res.json().catch(() => ({})) as {
    defaultOverheadPercent?: number
    globalOverheadPercent?: number
    defaultMisePercent?: number
    costRatioGoodMax?: number
    costRatioCautionMax?: number
    categoryTargets?: Record<string, number>
    message?: string
  }
  if (!res.ok) {
    throw new Error(data?.message || `OH 설정 조회 실패 (${res.status})`)
  }
  return {
    defaultOverheadPercent: data?.defaultOverheadPercent ?? 5,
    globalOverheadPercent: data?.globalOverheadPercent ?? 5,
    defaultMisePercent: data?.defaultMisePercent ?? 3,
    costRatioGoodMax: data?.costRatioGoodMax ?? 35,
    costRatioCautionMax: data?.costRatioCautionMax ?? 42,
    categoryTargets: data?.categoryTargets ?? {},
  }
}

export async function updateCostSettings(params: {
  globalOverheadPercent?: number
  defaultOverheadPercent?: number
  defaultMisePercent?: number
  costRatioGoodMax?: number
  costRatioCautionMax?: number
  categoryTargets?: Record<string, number>
}) {
  const res = await apiFetchWithOffline('/api/costSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string }
  if (!res.ok) {
    throw new Error(data?.message || `OH 설정 저장 실패 (${res.status})`)
  }
  return data
}

export async function deletePosMenuIngredient(
  params: { id: string },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/deletePosMenuIngredient', init)
    : await apiFetchWithOffline('/api/deletePosMenuIngredient', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deletePosMenuOption(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosMenuOption', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function savePosMenu(
  params: {
    id?: string
    /** 신규 등록 시 필수. 수정(id 있음) 시 생략 가능(부분 갱신) */
    code?: string
    name?: string
    category?: string
    categoryMain?: string
    price?: number
    priceDelivery?: number | null
    imageUrl?: string
    vatIncluded?: boolean
    isActive?: boolean
    sortOrder?: number
    optionSelectionGroups?: string[]
    optionSelectionConfig?: PosOptionSelectionGroupConfig[]
    kitchenPrinter?: number | null
    cookingTimeMin?: number | null
    deliveryAppFeePercent?: number | null
    isBanban?: boolean
    banbanFlavorMenuIds?: string[]
    descriptionDefault?: string
    descriptionDelivery?: string | null
    descriptionTable?: string | null
    storeCodes?: string[]
    sellHall?: boolean
    sellDelivery?: boolean
    sellPackaging?: boolean
    sellMember?: boolean
    /**
     * true 이면 image 컬럼만 갱신한다(프로모 연동 메뉴의 사진 단독 변경 등).
     * 서버는 다른 필드 비교를 건너뛴다.
     */
    imageOnly?: boolean
    /** true 이면 설명(description_*)만 갱신한다(프로모 연동 세트의 Grab 설명 등). */
    descriptionOnly?: boolean
  },
  opts?: { requireOnline?: boolean }
) {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }
  const res = opts?.requireOnline
    ? await apiFetch('/api/savePosMenu', init)
    : await apiFetchWithOffline('/api/savePosMenu', init)
  if (opts?.requireOnline) {
    return parsePosMutationResponse(res)
  }
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function syncPosMenuImageCrossChannels(params: {
  storeCode: string
  menuId?: string | number
  menuCode?: string
  imageUrl: string
  source?: 'menu-screen' | 'delivery-ops' | 'unknown'
}) {
  const res = await apiFetchWithOffline('/api/syncPosMenuImageCrossChannels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{
    success: boolean
    message?: string
    normalizedMenuCode?: string
    touchedMenuCount?: number
    touchedDeliveryImageCount?: number
  }>
}

export type ImportPosMenusResult = {
  success: boolean
  message?: string
  inserted?: number
  updated?: number
  skipped?: number
  errors?: string[]
  errorsTruncated?: boolean
}

/** POS 메뉴 일괄 업로드 (코드 기준 갱신·신규). 관리자 전용 — 온라인만. */
export async function importPosMenus(menus: PosMenuUpsertApiBody[]): Promise<ImportPosMenusResult> {
  const res = await apiFetch('/api/importPosMenus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menus }),
  })
  const data = (await res.json().catch(() => ({}))) as ImportPosMenusResult
  if (!res.ok) {
    throw new Error(data.message || `요청 실패 (${res.status})`)
  }
  return data
}

/** getPosMenus IDB 캐시를 서버 목록으로 덮어쓴 뒤 이벤트 알림 (일괄 저장 직후 목록 즉시 반영) */
export async function refreshPosMenusCatalogCache(params?: { storeCode?: string | null }): Promise<void> {
  try {
    const storeCode = String(params?.storeCode || '').trim()
    const q = new URLSearchParams()
    if (storeCode) q.set('storeCode', storeCode)
    const url = '/api/getPosMenus' + (q.toString() ? `?${q.toString()}` : '')
    const cacheKey = posMenusCatalogCacheKey(storeCode || null)
    const res = await apiFetch(url)
    if (!res.ok) return
    const list = (await res.json()) as unknown
    if (!Array.isArray(list)) return
    await setErpCache(cacheKey, list)
    notifyPosCatalogUpdated(cacheKey, list, { storeCode: storeCode || null })
  } catch {
    /* ignore */
  }
}

/** uploadPosMenuImage: 비 JSON 응답(413 HTML 등) 시 message로 구분 */
export const POS_MENU_UPLOAD_TOO_LARGE = '__POS_MENU_UPLOAD_TOO_LARGE__'

export async function uploadPosMenuImage(params: { file: File; menuId?: string | number }) {
  const file = params.file
  const menuIdRaw = params.menuId
  const pres = await apiFetchWithOffline('/api/uploadPosMenuImage/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size,
      ...(menuIdRaw != null && String(menuIdRaw).trim() !== ''
        ? { menuId: String(menuIdRaw).trim() }
        : {}),
    }),
  })
  const rawPres = await pres.text()
  let pjson: { success?: boolean; message?: string; signedUrl?: string; publicUrl?: string }
  try {
    pjson = JSON.parse(rawPres) as typeof pjson
  } catch {
    const tooLarge =
      pres.status === 413 ||
      /413|payload too large|entity too large|request entity too large/i.test(rawPres)
    return {
      success: false,
      message: tooLarge ? POS_MENU_UPLOAD_TOO_LARGE : undefined,
      url: undefined,
    }
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return {
      success: false,
      message: pjson.message,
      url: undefined,
    }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return {
      success: false,
      message: t || `Storage 업로드 실패 (${putRes.status})`,
      url: undefined,
    }
  }
  return {
    success: true,
    message: '업로드되었습니다.',
    url: pjson.publicUrl,
  }
}

/** 고객화면 평상시 배경 이미지·동영상 (pos-menu-images 버킷, customer-display/ 경로) */
export async function uploadCustomerDisplayMedia(params: { storeCode: string; file: File }) {
  const file = params.file
  const storeCode = String(params.storeCode || '').trim()
  const pres = await apiFetchWithOffline('/api/uploadCustomerDisplayMedia/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeCode,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size,
    }),
  })
  const rawPres = await pres.text()
  let pjson: { success?: boolean; message?: string; signedUrl?: string; publicUrl?: string }
  try {
    pjson = JSON.parse(rawPres) as typeof pjson
  } catch {
    const tooLarge =
      pres.status === 413 ||
      /413|payload too large|entity too large|request entity too large/i.test(rawPres)
    return {
      success: false,
      message: tooLarge ? POS_MENU_UPLOAD_TOO_LARGE : undefined,
      url: undefined,
    }
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return {
      success: false,
      message: pjson.message,
      url: undefined,
    }
  }
  const { putFileToSupabaseSignedUploadUrl } = await import('@/lib/storage-client-upload')
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, file, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return {
      success: false,
      message: t || `Storage 업로드 실패 (${putRes.status})`,
      url: undefined,
    }
  }
  return {
    success: true,
    message: '업로드되었습니다.',
    url: pjson.publicUrl,
  }
}

export async function deletePosMenu(params: { id: string }) {
  const res = await apiFetchWithOffline('/api/deletePosMenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePosMenuSoldOut(params: { id: string; soldOut: boolean }) {
  const res = await apiFetchWithOffline('/api/updatePosMenuSoldOut', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
