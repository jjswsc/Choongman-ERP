'use client'

import { useSearchParams } from 'next/navigation'
import { CashManagementTab } from '@/components/tabs/cash-management-tab'
import { getPosTourScenarioIdFromQuery, isPosDemoFromQuery, PosTourOverlay, PosTourProvider } from '@/lib/pos-tour'

/** POS 시재 관리 - 풀 리스트 + 등록 UI, 매출/영수증과 동일 동작 흐름 */
export default function PosLocalCashPage() {
  const searchParams = useSearchParams()
  const isPosDemo = isPosDemoFromQuery(searchParams)
  const tourScenarioId = getPosTourScenarioIdFromQuery(searchParams, 'pos-cash-management-tour')

  return (
    <PosTourProvider isDemo={isPosDemo} scenarioId={tourScenarioId}>
      <PosTourOverlay />
      <CashManagementTab offlineAware />
    </PosTourProvider>
  )
}
