"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Home, ArrowLeft, Settings, RefreshCw, Languages } from "lucide-react"
import type { Store } from "@/lib/pos-types"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

interface PosHeaderProps {
  /** V0: 매장 목록 (있으면 매장 선택기 표시) */
  stores?: Store[]
  currentStoreId?: string
  onStoreChange?: (storeId: string) => void
  /** 오늘 완료 건수 (V0) / 기존 todayOrders 호환 */
  todayCompleted?: number
  totalSales?: number
  /** 기존 호환 */
  todayOrders?: number
  totalAmount?: number
  /** V0: Admin으로 돌아가기 링크 표시 */
  showBackToAdmin?: boolean
  /** 기존: 뒤로가기 버튼 */
  showBackButton?: boolean
  onBack?: () => void
  /** 관리자 페이지 접근 가능 시에만 Admin/설정 링크 표시 (포스 직원은 숨김) */
  canAccessAdmin?: boolean
  /** 매장 선택 표시 여부 (오피스 직원만 true, 나머지는 자기 매장 고정) */
  canChangeStore?: boolean
  /** 테이블 현황 등 새로고침 시 호출 (미전달 시 location.reload) */
  onRefresh?: () => void
  title?: string
  className?: string
}

export function POSHeader({
  stores = [],
  currentStoreId = "",
  onStoreChange,
  todayCompleted,
  totalSales,
  todayOrders = 0,
  totalAmount = 0,
  showBackToAdmin = false,
  showBackButton = true,
  onBack,
  canAccessAdmin: canAccessAdminProp = true,
  canChangeStore = true,
  onRefresh,
  title = "POS",
  className,
}: PosHeaderProps) {
  const router = useRouter()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const completed = todayCompleted ?? todayOrders
  const sales = totalSales ?? totalAmount
  const showStoreSelect = canChangeStore && stores.length > 0 && currentStoreId && onStoreChange

  const langOptions: { value: typeof lang; labelKey: string }[] = [
    { value: 'ko', labelKey: 'posLangKo' },
    { value: 'en', labelKey: 'posLangEn' },
    { value: 'th', labelKey: 'posLangTh' },
    { value: 'mm', labelKey: 'posLangMm' },
    { value: 'la', labelKey: 'posLangLa' },
    { value: 'kh', labelKey: 'posLangKh' },
    { value: 'vi', labelKey: 'posLangVi' },
    { value: 'ms', labelKey: 'posLangMs' }
  ]

  return (
    <header
      className={cn(
        "h-14 border-b border-border bg-card px-4 flex items-center justify-between flex-shrink-0",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Link href="/pos">
            <Button variant="ghost" size="icon" className="h-8 w-8" title={t('posHome') || '포스 첫 화면'}>
              <Home className="w-4 h-4" />
            </Button>
          </Link>
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              onClick={() => (onBack ? onBack() : router.back())}
              title={t('posBack') || '뒤로가기'}
            >
              <ArrowLeft className="w-4 h-4" />
              {t('posBack') || '뒤로가기'}
            </Button>
          )}
        </div>

        {showStoreSelect && (
          <div className="flex items-center gap-2">
            <Select value={currentStoreId} onValueChange={onStoreChange}>
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue placeholder={t('posStoreSelect')} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              {t('posRefresh')}
            </Button>
          </div>
        )}

        <span className="text-sm text-muted-foreground">
          {t('posTodayCompleted')}:{" "}
          <span className="font-semibold text-foreground">{completed}{t('posCount')}</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
          <SelectTrigger className="w-[100px] h-8 gap-1" aria-label={t('posLanguage')}>
            <Languages className="w-3.5 h-3.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {langOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-lg font-bold text-foreground">
          {sales.toLocaleString()} ฿
        </span>
        {canAccessAdminProp && (
          <Link href="/admin/pos-screen-config">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}
