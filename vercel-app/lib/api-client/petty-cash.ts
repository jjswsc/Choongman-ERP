/**
 * 패티캐시 API (api-client.ts에서 분리 — move only)
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { getPettyCashListWithCache } from '../offline/erp-offline'
import { readAutoTranslateEnabled } from '../auto-translate'
import type { PaginatedList } from './types'

export interface PettyCashItem {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number | null
  memo: string
  receipt_url?: string
  user_name: string
  account_subject_id?: number | null
  accountSubjectId?: number | null
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  vatAmount?: number
  vendorCode?: string
}

export async function getPettyCashOptions(): Promise<{ stores: string[]; officeDepartments: string[] }> {
  const res = await apiFetchWithOffline('/api/getPettyCashOptions')
  return res.json()
}

export async function getPettyCashList(params: {
  startStr: string
  endStr: string
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore?: string
  userRole?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedList<PettyCashItem>> {
  const data = (await getPettyCashListWithCache(params)) as
    | PaginatedList<PettyCashItem>
    | PettyCashItem[]
    | unknown
  if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as PaginatedList<PettyCashItem>).items)) {
    const p = data as PaginatedList<PettyCashItem>
    return {
      items: p.items,
      total: p.total ?? 0,
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 25,
    }
  }
  const arr = Array.isArray(data) ? (data as PettyCashItem[]) : []
  return { items: arr, total: arr.length, page: params.page ?? 1, pageSize: params.pageSize ?? 25 }
}

/** 해당 월 또는 기간 거래 전체 + 실시간 잔액 */
export async function getPettyCashMonthDetail(params: {
  yearMonth: string
  startStr?: string
  endStr?: string
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  userStore?: string
  userRole?: string
}) {
  const q = new URLSearchParams({ yearMonth: params.yearMonth })
  if (params.startStr && params.endStr) {
    q.set('startStr', params.startStr)
    q.set('endStr', params.endStr)
  }
  if (params.scopeFilter) q.set('scopeFilter', params.scopeFilter)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.departmentFilter) q.set('departmentFilter', params.departmentFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  const res = await apiFetchWithOffline(`/api/getPettyCashMonthDetail?${q}`)
  return jsonAsArray<PettyCashItem>(await res.json())
}

export type PettyCashSummaryResult = {
  expenseTotal: number
  inflowTotal: number
  netChange: number
  vatTotal: number
  vatPendingTotal: number
  vatPendingCount: number
  rowCount: number
  source?: 'rpc' | 'fallback'
  truncated?: boolean
}

/** DB RPC 기간 합계 — 페이지·2,000건 limit 없이 집계 (RPC 미배포 시 fallback) */
export async function getPettyCashSummary(params: {
  startStr: string
  endStr: string
  scopeFilter?: string
  storeFilter?: string
  departmentFilter?: string
  filterTransType?: string
  filterAccountSubjectId?: string
  filterAccountSubjectEmpty?: boolean
  filterMemoKeyword?: string
  filterInvoiceStatus?: string
  filterPp30VatOnly?: boolean
}): Promise<PettyCashSummaryResult> {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.scopeFilter) q.set('scopeFilter', params.scopeFilter)
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.departmentFilter) q.set('departmentFilter', params.departmentFilter)
  if (params.filterTransType) q.set('filterTransType', params.filterTransType)
  if (params.filterAccountSubjectId) q.set('filterAccountSubjectId', params.filterAccountSubjectId)
  if (params.filterAccountSubjectEmpty) q.set('filterAccountSubjectEmpty', '1')
  if (params.filterMemoKeyword) q.set('filterMemoKeyword', params.filterMemoKeyword)
  if (params.filterInvoiceStatus) q.set('filterInvoiceStatus', params.filterInvoiceStatus)
  if (params.filterPp30VatOnly) q.set('filterPp30VatOnly', '1')
  const res = await apiFetchWithOffline(`/api/getPettyCashSummary?${q}`)
  const data = (await res.json()) as PettyCashSummaryResult
  return {
    expenseTotal: Number(data.expenseTotal ?? 0) || 0,
    inflowTotal: Number(data.inflowTotal ?? 0) || 0,
    netChange: Number(data.netChange ?? 0) || 0,
    vatTotal: Number(data.vatTotal ?? 0) || 0,
    vatPendingTotal: Number(data.vatPendingTotal ?? 0) || 0,
    vatPendingCount: Number(data.vatPendingCount ?? 0) || 0,
    rowCount: Number(data.rowCount ?? 0) || 0,
    source: data.source,
    truncated: Boolean(data.truncated),
  }
}

/** 세션 내 번역 캐시 (같은 원문 재요청 생략) */
const translateClientCache = new Map<string, string>()
const TRANSLATE_CLIENT_CACHE_MAX = 600

function translateCacheKey(text: string, lang: string) {
  return `${lang}\0${text}`
}

/** 사용자 입력 내용(memo 등) 번역 - 로그인 언어로 표시
 *  @param opts.force 공지·규정 등: 자동번역 OFF여도 선택 언어로 번역
 */
export async function translateTexts(
  texts: string[],
  targetLang: string,
  opts?: { force?: boolean }
): Promise<string[]> {
  const filtered = texts.filter((s) => s && String(s).trim()).map((s) => String(s).trim())
  if (filtered.length === 0) return []
  if (!opts?.force && !readAutoTranslateEnabled()) return filtered
  const tl = String(targetLang || 'ko').toLowerCase().slice(0, 2)

  const results = new Array<string>(filtered.length)
  const missingIdx: number[] = []
  const missingTexts: string[] = []
  filtered.forEach((src, i) => {
    const hit = translateClientCache.get(translateCacheKey(src, tl))
    if (hit !== undefined) {
      results[i] = hit
    } else {
      missingIdx.push(i)
      missingTexts.push(src)
    }
  })
  if (missingTexts.length === 0) return results

  try {
    const res = await apiFetchWithOffline('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: missingTexts, targetLang: tl }),
    })
    const data = (await res.json()) as { translated?: string[] }
    const translated = Array.isArray(data?.translated) ? data.translated : []
    if (translated.length !== missingTexts.length) {
      missingIdx.forEach((idx, j) => {
        results[idx] = missingTexts[j]!
      })
      return results.map((v, i) => v ?? filtered[i]!)
    }
    missingIdx.forEach((idx, j) => {
      const src = missingTexts[j]!
      const out = (translated[j] == null ? '' : String(translated[j])).trim() || src
      results[idx] = out
      const key = translateCacheKey(src, tl)
      if (translateClientCache.has(key)) translateClientCache.delete(key)
      translateClientCache.set(key, out)
      while (translateClientCache.size > TRANSLATE_CLIENT_CACHE_MAX) {
        const oldest = translateClientCache.keys().next().value
        if (oldest === undefined) break
        translateClientCache.delete(oldest)
      }
    })
    return results.map((v, i) => v ?? filtered[i]!)
  } catch {
    return filtered
  }
}

export async function addPettyCashTransaction(params: {
  store: string
  transDate: string
  transType: string
  amount: number
  memo?: string
  receiptUrl?: string
  accountSubjectId?: number | null
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  vatAmount?: number
  vendorCode?: string
  userName?: string
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/addPettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 시재(카운터 현금) 입출금 목록 - pos_till_transactions */
export interface TillItem {
  id: number
  store: string
  trans_date: string
  trans_type: string
  amount: number
  balance_after: number | null
  memo: string
  user_name: string
  /** 매출액 출금일 때만: 해당 현금 매출의 영업일 */
  sales_date?: string | null
}

export async function getTillList(params: {
  startStr: string
  endStr: string
  storeFilter?: string
  userStore?: string
  userRole?: string
  /** all | till_only(일반 입출금만) | sales_withdrawal_only(매출액 출금만) */
  typeFilter?: 'all' | 'till_only' | 'sales_withdrawal_only'
}) {
  const q = new URLSearchParams({
    startStr: params.startStr,
    endStr: params.endStr,
  })
  if (params.storeFilter) q.set('storeFilter', params.storeFilter)
  if (params.userStore) q.set('userStore', params.userStore)
  if (params.userRole) q.set('userRole', params.userRole)
  if (params.typeFilter && params.typeFilter !== 'all') q.set('typeFilter', params.typeFilter)
  const res = await apiFetchWithOffline(`/api/getTillList?${q}`)
  return jsonAsArray<TillItem>(await res.json())
}

export async function addTillTransaction(params: {
  storeCode: string
  transDate: string
  transType: 'deposit' | 'withdrawal' | 'sales_withdrawal'
  amount: number
  memo?: string
  userName?: string
  userStore?: string
  userRole?: string
  /** 매출액 출금 시 해당 현금 매출의 영업일 (YYYY-MM-DD) */
  salesDate?: string
}): Promise<{ success: boolean; message?: string; queued?: boolean; transactionId?: number }> {
  const res = await apiFetchWithOffline('/api/addTillTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as {
    success?: boolean
    message?: string
    queued?: boolean
    transactionId?: number
  }
  const queued = res.headers.get('X-Offline-Queued') === '1' || data.queued === true
  const rawTid = data.transactionId
  const transactionId =
    typeof rawTid === 'number' && Number.isFinite(rawTid)
      ? rawTid
      : typeof rawTid === 'string' && /^\d+$/.test(String(rawTid))
        ? Number(rawTid)
        : undefined
  return {
    success: Boolean(data.success),
    message: typeof data.message === 'string' ? data.message : undefined,
    queued,
    ...(transactionId != null ? { transactionId } : {}),
  }
}

/** 시재 매출 출금(sales_withdrawal) 한 건 삭제 */
export async function deleteTillTransaction(params: {
  id: number
}): Promise<{ success: boolean; message?: string; queued?: boolean }> {
  const res = await apiFetchWithOffline('/api/deleteTillTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: params.id }),
  })
  const data = (await res.json()) as { success?: boolean; message?: string; queued?: boolean }
  const queued = res.headers.get('X-Offline-Queued') === '1' || data.queued === true
  return {
    success: Boolean(data.success),
    message: typeof data.message === 'string' ? data.message : undefined,
    queued,
  }
}

/** 패티캐시 거래 수정 - 월별 현황에서 조회 후 수정 */
export async function updatePettyCashTransaction(params: {
  id: number
  transDate: string
  transType: string
  amount: number
  memo?: string
  receiptUrl?: string | null
  accountSubjectId?: number | null
  /** 빈 문자열이면 거래처 해제 */
  vendorCode?: string | null
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string | null
  vatAmount?: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/updatePettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.id,
      transDate: params.transDate,
      transType: params.transType,
      amount: params.amount,
      memo: params.memo ?? '',
      receiptUrl: params.receiptUrl,
      accountSubjectId: params.accountSubjectId,
      ...(params.vendorCode !== undefined ? { vendorCode: params.vendorCode ?? '' } : {}),
      invoiceReceived: params.invoiceReceived,
      invoiceNo: params.invoiceNo,
      invoicePhotoUrl: params.invoicePhotoUrl,
      vatAmount: params.vatAmount,
      userStore: params.userStore,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

export async function updatePettyCashTransactionInvoice(params: {
  pettyCashId: number
  invoiceReceived?: boolean
  invoiceNo?: string
  invoicePhotoUrl?: string
  vatAmount?: number
}) {
  const res = await apiFetchWithOffline('/api/updatePettyCashTransactionInvoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}

/** 패티캐시 거래 삭제 */
export async function deletePettyCashTransaction(params: {
  id: number
  userStore?: string
  userRole?: string
}) {
  const res = await apiFetchWithOffline('/api/deletePettyCashTransaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: params.id,
      userStore: params.userStore,
      userRole: params.userRole,
    }),
  })
  return res.json() as Promise<{ success: boolean; message?: string }>
}
