import { isOfficeStore } from '@/lib/permissions'
import { isSandboxStoreCode } from '@/lib/pos-sales-test-office'
import { dedupeOfficeStoreOptions } from '@/lib/office-store-canonical'

export const TIMESHEET_ALL_STORE = 'All'

/**
 * 근태·시간표 매장 선택 — CM Office 포함, test/HQ만 제외.
 * 매출 대시보드용 `filterOperationalStorePickerOptions`와 분리한다.
 */
export function filterHrAttendanceStorePickerOptions(stores: string[]): string[] {
  return dedupeOfficeStoreOptions(
    stores.filter((s) => {
      const t = String(s || '').trim()
      return t && t !== TIMESHEET_ALL_STORE && !isSandboxStoreCode(t)
    })
  )
}

/**
 * 시간표·당일 실시간 근무 API에 넘길 매장 키.
 * 오피스는 All로 바꾸지 않는다(본사 근무 조회가 비는 원인).
 */
export function resolveTimesheetQueryStore(params: {
  authStore?: string | null
  isOfficeStaff: boolean
  pickedStore: string
  resolveStoreKey: (raw: string) => string
}): string {
  const authStore = String(params.authStore || '').trim()
  if (!authStore) return ''
  if (!params.isOfficeStaff) return params.resolveStoreKey(authStore) || authStore
  const raw = String(params.pickedStore || '').trim()
  if (!raw || raw === TIMESHEET_ALL_STORE) return TIMESHEET_ALL_STORE
  return params.resolveStoreKey(raw) || raw
}

/** 상단 매출 매장바 값 → 시간표 초기 선택. 오피스/빈 값은 전체 */
export function timesheetPickedStoreFromViewStore(viewStore: string | null | undefined): string {
  const raw = String(viewStore || '').trim()
  if (!raw || isOfficeStore(raw)) return TIMESHEET_ALL_STORE
  return raw
}
