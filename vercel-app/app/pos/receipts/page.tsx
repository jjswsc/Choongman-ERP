'use client'

import { useRouter } from 'next/navigation'
import { ReceiptsManagementTab } from '@/components/tabs/receipts-management-tab'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { useT } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import { Button } from '@/components/ui/button'
import { Home, Receipt } from 'lucide-react'

/** POS 영수증 관리 - 오프라인 지원, 조회/인쇄만 (수정 비활성화) */
export default function PosReceiptsPage() {
  const router = useRouter()
  const t = useT(useLang().lang)
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">
              {t('posReceiptManage') || '영수증 관리'}
            </h1>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            title={t('posHome') || '포스 첫 화면'}
            onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">{t('posHome') || '홈'}</span>
          </Button>
        </div>
        <ReceiptsManagementTab offlineAware readOnly />
      </div>
    </div>
  )
}
