'use client'

import { CashManagementTab } from '@/components/tabs/cash-management-tab'

/** POS 시재 관리 - 풀 리스트 + 등록 UI, 매출/영수증과 동일 동작 흐름 */
export default function PosLocalCashPage() {
  return <CashManagementTab offlineAware />
}
