'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { PosBusinessOpenBlockReason } from '@/lib/pos-business-open-gate-client'

export type PosBusinessOpenGateBlockProps = {
  blocked: boolean
  loading?: boolean
  businessDateYmd?: string
  blockReason?: PosBusinessOpenBlockReason
  prevBusinessDateYmd?: string
  className?: string
  children: React.ReactNode
}

/** 영업 시작(시재) 미완료 시 주문 UI 위 차단 오버레이 */
export function PosBusinessOpenGateBlock({
  blocked,
  loading = false,
  businessDateYmd,
  blockReason = 'never_opened',
  prevBusinessDateYmd,
  className,
  children,
}: PosBusinessOpenGateBlockProps) {
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)

  const title =
    blockReason === 'new_business_day'
      ? t('posBusinessOpenNewDayTitle') || '새 영업일 시재 등록이 필요합니다'
      : t('posBusinessOpenRequiredTitle') || '영업 시작(시재 등록)이 필요합니다'

  const body =
    blockReason === 'new_business_day'
      ? t('posBusinessOpenNewDayBody') ||
        `아침에 등록한 시제는 이전 영업일${prevBusinessDateYmd ? `(${prevBusinessDateYmd})` : ''} 기준입니다. 현재 영업일${businessDateYmd ? `(${businessDateYmd})` : ''} 시제를 다시 입력·저장해 주세요.`
      : t('posBusinessOpenRequiredBody') ||
        '오늘 POS를 시작하려면 먼저 영업 관리 > 영업 시작에서 돈통 시제를 입력·저장해 주세요.'

  return (
    <div className={cn('relative min-h-0', className)}>
      {children}
      {!loading && blocked ? (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-background/85 p-4 backdrop-blur-[2px]"
          role="alertdialog"
          aria-labelledby="pos-business-open-gate-title"
          aria-describedby="pos-business-open-gate-body"
        >
          <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-lg">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <Lock className="h-6 w-6" aria-hidden />
            </div>
            <h2 id="pos-business-open-gate-title" className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            <p id="pos-business-open-gate-body" className="mt-2 text-sm text-muted-foreground">
              {body}
            </p>
            {businessDateYmd ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('posBusinessOpenRequiredDate') || '영업일'}: {businessDateYmd}
              </p>
            ) : null}
            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => router.push('/pos/settlement?mode=open')}
            >
              {t('posBusinessOpenRequiredAction') || '영업 시작으로 이동'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
