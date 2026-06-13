'use client'

import { Wallet } from 'lucide-react'
import { CashManagementTab } from '@/components/tabs/cash-management-tab'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

/** 관리자 시재 입출금 + 매출액 출금 (POS와 동일 UI, 오프라인 미지원) */
export default function AdminPosCashPage() {
  const t = useT(useLang().lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t('adminPosCash') || '시재 입출금'}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('posCashPageSub') || '매장 시재 입출금·매출액 출금을 관리합니다.'}
            </p>
          </div>
        </div>
        <CashManagementTab adminLayout />
      </div>
    </div>
  )
}
