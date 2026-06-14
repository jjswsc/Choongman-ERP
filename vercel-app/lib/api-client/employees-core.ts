/**
 * 직원 CRUD·가맹 다매장·定員 API — employees.ts에서 분리 — move only
 */
import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'

export interface AdminEmployeeItem {
  row: number
  store: string
  name: string
  /** Mr./Mrs./Ms./Miss — nick과 별도 저장 */
  nameTitle?: string
  /** 직원 코드(휴가·표시용). 형식 AA999, 비우면 매장별 자동 부여 */
  employeeCode?: string
  nick: string
  phone: string
  job: string
  birth: string
  nation: string
  join: string
  resign: string
  /** 재직 상태. 미전달 시 resign 기준으로 서버 추론 */
  employmentStatus?: 'active' | 'leave' | 'resigned' | 'suspended'
  /** 소프트 삭제 시각 (있으면 목록에서 제외) */
  deletedAt?: string
  salType: string
  salAmt: number
  pw: string
  role: string
  email: string
  idNumber: string
  idCardPhoto: string
  taxId: string
  ssoNumber: string
  /** true면 급여 SSO 공제 0 + PND3용 3% 원천세 대상 */
  ssoExempt?: boolean
  address: string
  bankName: string
  accountNumber: string
  positionAllowance: number
  riskAllowance: number
  /** 근면수당(바트/월). 0=미적용. 비어 있으면 서버/폼 기본 500 */
  attendanceAllowance: number
  grade: string
  photo: string
  /** 가맹점주 추가 매장 (대표 store 제외) */
  extraStores?: string[]
}

export type FranchiseeMultiStoreSettings = {
  enabled: boolean
  maxStores: number
}

export async function getEmployeeJobCatalog() {
  const res = await apiFetchWithOffline('/api/employeeJobCatalog')
  const data = await res.json()
  return {
    catalog: (data.catalog || []) as string[],
    jobsInUseOutsideCatalog: (data.jobsInUseOutsideCatalog || []) as string[],
    canEdit: Boolean(data.canEdit),
  }
}

export async function saveEmployeeJobCatalog(jobs: string[]) {
  const res = await apiFetchWithOffline('/api/employeeJobCatalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobs }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export type FranchiseeMultiStoreSettingsResponse = {
  success?: boolean
  settings?: FranchiseeMultiStoreSettings
  message?: string
}

/** 네트워크 단절·DNS 등으로 fetch 자체가 실패할 때 TypeError를 삼키고 호출부 런타임 오류를 막음 */
export async function getFranchiseeMultiStoreSettings(): Promise<FranchiseeMultiStoreSettingsResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreSettings')
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreSettingsResponse
    return data && typeof data === 'object' ? data : {}
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export type FranchiseeMultiStoreRosterItem = {
  row: number
  store: string
  name: string
  nick: string
  role: string
  extraStores: string[]
}

export type FranchiseeMultiStoreRosterResponse = {
  success?: boolean
  settings?: FranchiseeMultiStoreSettings
  roster?: FranchiseeMultiStoreRosterItem[]
  stores?: string[]
  saved?: number
  message?: string
}

export async function getFranchiseeMultiStoreRoster(): Promise<FranchiseeMultiStoreRosterResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreRoster')
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreRosterResponse
    const out = data && typeof data === 'object' ? data : {}
    if (!res.ok && out.success !== false) {
      return { success: false, message: out.message || `HTTP ${res.status}` }
    }
    return out
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export async function saveFranchiseeMultiStoreRoster(
  assignments: { employeeId: number; extraStores: string[] }[],
  options?: { syncSettings?: FranchiseeMultiStoreSettings }
): Promise<FranchiseeMultiStoreRosterResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreRoster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignments,
        ...(options?.syncSettings
          ? {
              settings: {
                enabled: options.syncSettings.enabled === true,
                maxStores: options.syncSettings.maxStores,
              },
            }
          : {}),
      }),
    })
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreRosterResponse
    const out = data && typeof data === 'object' ? data : {}
    if (!res.ok && out.success !== false) {
      return { success: false, message: out.message || `HTTP ${res.status}` }
    }
    return out
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export async function saveFranchiseeMultiStoreSettings(
  settings: FranchiseeMultiStoreSettings
): Promise<FranchiseeMultiStoreSettingsResponse> {
  try {
    const res = await apiFetch('/api/franchiseeMultiStoreSettings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const data = (await res.json().catch(() => ({}))) as FranchiseeMultiStoreSettingsResponse
    return data && typeof data === 'object' ? data : {}
  } catch {
    return { success: false, message: 'network_unavailable' }
  }
}

export async function getAdminEmployeeList(params: {
  userStore: string
  userRole: string
  forPettyTransfer?: boolean
  search?: string
  status?: string
  store?: string
  job?: string
  page?: number
  pageSize?: number
}) {
  const q = new URLSearchParams({
    userStore: params.userStore,
    userRole: params.userRole,
  })
  if (params.forPettyTransfer) q.set('forPettyTransfer', '1')
  if (params.search) q.set('search', params.search)
  if (params.status) q.set('status', params.status)
  if (params.store) q.set('store', params.store)
  if (params.job) q.set('job', params.job)
  if (params.page && Number.isFinite(params.page)) q.set('page', String(Math.trunc(params.page)))
  if (params.pageSize && Number.isFinite(params.pageSize)) q.set('pageSize', String(Math.trunc(params.pageSize)))
  const res = await apiFetchWithOffline(`/api/getAdminEmployeeList?${q}`)
  const data = await res.json()
  return {
    list: (data.list || []) as AdminEmployeeItem[],
    stores: (data.stores || []) as string[],
    jobOptions: (data.jobOptions || []) as string[],
    _debug: data._debug as Record<string, unknown> | undefined,
  }
}

export async function getEmployeeLatestGrades() {
  const res = await apiFetchWithOffline('/api/getEmployeeLatestGrades')
  return res.json() as Promise<
    Record<
      string,
      {
        grade: string
        kitchenGrade?: string
        serviceGrade?: string
        managerGrade?: string
        latestAny?: string
      }
    >
  >
}

export async function saveAdminEmployee(params: {
  d: (Partial<AdminEmployeeItem> & { row: number }) & { changeReason?: string }
  userStore: string
  userRole: string
  userName?: string
  /** 본사만: 가맹점주 추가 매장 */
  extraStores?: string[]
}) {
  const res = await apiFetchWithOffline('/api/saveAdminEmployee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function deleteAdminEmployee(params: {
  r: number
  userStore: string
  userRole: string
  reason?: string
}) {
  const res = await apiFetchWithOffline('/api/deleteAdminEmployee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export interface EmployeeInputAuditChange {
  field: string
  oldValue: string
  newValue: string
}

export interface EmployeeInputAuditRow {
  id: number
  actionType: string
  changedAt: string
  actorName: string | null
  actorRole: string | null
  actorStore: string | null
  actorEmployeeCode: string | null
  employeeId: number | null
  employeeCode: string | null
  employeeName: string | null
  employeeStore: string | null
  changeReason: string | null
  changes: EmployeeInputAuditChange[]
  changeCount: number
}

export async function getEmployeeInputAudit(params?: {
  limit?: number
  startDate?: string
  endDate?: string
}): Promise<EmployeeInputAuditRow[]> {
  const qs = new URLSearchParams()
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.startDate) qs.set('startDate', params.startDate)
  if (params?.endDate) qs.set('endDate', params.endDate)
  const q = qs.toString() ? `?${qs.toString()}` : ''
  const res = await apiFetch(`/api/getEmployeeInputAudit${q}`)
  const data = await res.json().catch(() => [])
  if (!res.ok) return []
  return Array.isArray(data) ? (data as EmployeeInputAuditRow[]) : []
}

export interface StoreJobHeadcountRow {
  store: string
  job: string
  target_count: number
  updated_at?: string
}

export async function getStoreJobHeadcount(params?: { store?: string }) {
  const q = new URLSearchParams()
  if (params?.store) q.set('store', params.store)
  const qs = q.toString()
  const res = await apiFetchWithOffline(`/api/getStoreJobHeadcount${qs ? `?${qs}` : ''}`)
  const data = await res.json()
  return {
    list: (data.list || []) as StoreJobHeadcountRow[],
    _note: data._note as string | undefined,
  }
}

export async function saveStoreJobHeadcount(params: { store: string; rows: { job: string; target_count: number }[] }) {
  const res = await apiFetchWithOffline('/api/saveStoreJobHeadcount', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
