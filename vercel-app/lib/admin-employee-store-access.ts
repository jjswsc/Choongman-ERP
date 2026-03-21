import { isAccountingRole, isOfficeStore } from '@/lib/permissions'

/** userStore와 empStore 매칭 - "CM " 접두사 차이 허용 (getAdminEmployeeList와 동일) */
export function storeMatches(userStore: string, empStore: string): boolean {
  if (!userStore || !empStore) return false
  if (userStore === empStore) return true
  const cmPrefixed = empStore.startsWith('CM ') ? empStore.slice(3) : 'CM ' + empStore
  return userStore === cmPrefixed || empStore === cmPrefixed
}

/** 직원/적정인원 등 매장 단위 데이터 조회·수정 권한 (getAdminEmployeeList 필터와 동일) */
export function userCanAccessEmployeeStore(userRole: string, userStore: string, targetStore: string): boolean {
  const role = userRole.toLowerCase()
  if (role.includes('director') || role.includes('ceo') || role.includes('hr') || isAccountingRole(role)) {
    return true
  }
  if (role.includes('officer')) {
    return !isOfficeStore(targetStore)
  }
  if (role.includes('manager') || role.includes('franchisee')) {
    return storeMatches(userStore, targetStore)
  }
  return storeMatches(userStore, targetStore)
}
