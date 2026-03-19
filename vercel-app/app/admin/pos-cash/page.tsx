'use client'

import { CashManagementTab } from '@/components/tabs/cash-management-tab'

/** 관리자 시재 입출금 + 매출액 출금 (POS와 동일 UI, 오프라인 미지원) */
export default function AdminPosCashPage() {
  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-4xl">
        <CashManagementTab />
      </div>
    </div>
  )
}
