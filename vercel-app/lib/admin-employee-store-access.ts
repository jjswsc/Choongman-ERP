import { isAccountingRole, isFranchiseeRole, isOfficeStore, isSupervisorRole } from '@/lib/permissions'

/** userStore와 empStore 매칭 - "CM " 접두사 차이 허용 (getAdminEmployeeList와 동일) */
export function storeMatches(userStore: string, empStore: string): boolean {
  if (!userStore || !empStore) return false
  if (userStore === empStore) return true
  const cmPrefixed = empStore.startsWith('CM ') ? empStore.slice(3) : 'CM ' + empStore
  return userStore === cmPrefixed || empStore === cmPrefixed
}

type EmployeeStoreAccessOpts = { forPettyTransfer?: boolean; allowedStores?: string[] }

/** 직원/적정인원 등 매장 단위 데이터 조회·수정 권한 (getAdminEmployeeList 필터와 동일) */
export function userCanAccessEmployeeStore(
  userRole: string,
  userStore: string,
  targetStore: string,
  opts?: EmployeeStoreAccessOpts
): boolean {
  const role = userRole.toLowerCase()
  if (role.includes('director') || role.includes('secretary') || role.includes('ceo') || role.includes('hr') || isAccountingRole(role)) {
    return true
  }
  /** 오피스(본사) 소속은 직무·role과 무관하게 전 매장 직원 조회·수정 허용 */
  if (isOfficeStore(userStore)) {
    return true
  }
  if (role.includes('officer')) {
    if (opts?.forPettyTransfer && isOfficeStore(targetStore)) return true
    return !isOfficeStore(targetStore)
  }
  if (isFranchiseeRole(role) || isSupervisorRole(role)) {
    const list = opts?.allowedStores?.map((s) => String(s || '').trim()).filter(Boolean) ?? []
    if (list.length > 0) {
      return list.some((s) => storeMatches(s, targetStore))
    }
    return storeMatches(userStore, targetStore)
  }
  if (role.includes('manager')) {
    return storeMatches(userStore, targetStore)
  }
  return storeMatches(userStore, targetStore)
}
