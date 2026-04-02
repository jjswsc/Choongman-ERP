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
import { Home, ArrowLeft, Settings, RefreshCw, Languages, Monitor, Smartphone, LayoutDashboard, HardDriveDownload } from "lucide-react"
import type { Store } from "@/lib/pos-types"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { navigatePosOfflineAware } from "@/lib/pos-offline-nav"
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
  /** 기존: 뒤로가기 버튼 (터미널·메뉴 내부 네비용) */
  showBackButton?: boolean
  onBack?: () => void
  /** POS 홈: 관리자(/admin)로 가기 — 뒤로가기가 아닌 명시 버튼 */
  showAdminNavButton?: boolean
  onAdminNav?: () => void
  /** 관리자 페이지 접근 가능 시에만 Admin/설정 링크 표시 (포스 직원은 숨김) */
  canAccessAdmin?: boolean
  /** 매장 선택 표시 여부 (오피스 직원만 true, 나머지는 자기 매장 고정) */
  canChangeStore?: boolean
  /** 테이블 현황 등 새로고침 시 호출 (미전달 시 location.reload) */
  onRefresh?: () => void
  /** 인터넷이 될 때 로컬에 POS 오프라인용 캐시 채우기 */
  onPrefetchOfflineData?: () => void
  prefetchOfflineDataBusy?: boolean
  title?: string
  className?: string
  /** 메인 포스 모드 (프린터 연결, 태블릿 주문 수신 인쇄) */
  isMainPosDevice?: boolean
  onMainPosDeviceChange?: (value: boolean) => void
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
  showAdminNavButton = false,
  onAdminNav,
  canAccessAdmin: canAccessAdminProp = true,
  canChangeStore = true,
  onRefresh,
  onPrefetchOfflineData,
  prefetchOfflineDataBusy = false,
  title = "POS",
  className,
  isMainPosDevice,
  onMainPosDeviceChange,
}: PosHeaderProps) {
  const router = useRouter()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const sales = totalSales ?? totalAmount
  const showStoreSelect = canChangeStore && stores.length > 0 && currentStoreId && onStoreChange
  const offlinePrefetchTitle = t("adminOfflinePrefetchTitle") || t("posOfflinePrefetchTitle") || ""

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
        "grid min-h-14 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-b border-border bg-card px-3 py-2 sm:gap-x-3 sm:px-4 lg:h-14 lg:gap-x-4 lg:py-0",
        className
      )}
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-x-auto sm:gap-x-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={t('posHome') || '포스 첫 화면'}
            onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
          >
            <Home className="w-4 h-4" />
          </Button>
          {showAdminNavButton && onAdminNav ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
              type="button"
              onClick={onAdminNav}
              title={t("posNavAdmin") || "관리자"}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="text-xs font-medium">{t("posNavAdmin") || "관리자"}</span>
            </Button>
          ) : (
            showBackButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1"
                onClick={() => (onBack ? onBack() : router.back())}
                title={t("posBack") || "뒤로가기"}
              >
                <ArrowLeft className="w-4 h-4" />
                {t("posBack") || "뒤로가기"}
              </Button>
            )
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
              className="h-8 shrink-0 px-2 sm:px-3"
              onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
            >
              <RefreshCw className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t('posRefresh')}</span>
            </Button>
            {onPrefetchOfflineData && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1 border-emerald-600/40 px-2 text-emerald-800 hover:bg-emerald-50 sm:px-3"
                disabled={prefetchOfflineDataBusy}
                title={offlinePrefetchTitle}
                onClick={() => onPrefetchOfflineData()}
              >
                <HardDriveDownload className="h-4 w-4 shrink-0" />
                <span className="hidden max-[380px]:hidden sm:inline">
                  {prefetchOfflineDataBusy ? t("posOfflinePrefetching") : t("posOfflinePrefetch")}
                </span>
              </Button>
            )}
          </div>
        )}

        {typeof isMainPosDevice === "boolean" && onMainPosDeviceChange && (
          <Button
            variant={isMainPosDevice ? "default" : "outline"}
            size="sm"
            className="h-8 shrink-0 gap-1 sm:gap-1.5"
            onClick={() => onMainPosDeviceChange(!isMainPosDevice)}
            title={isMainPosDevice ? (t('posMainDeviceOn') || '메인 포스 (프린터 연결)') : (t('posMainDeviceOff') || '주문 단말')}
          >
            {isMainPosDevice ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
            <span className="hidden text-xs sm:inline">
              {isMainPosDevice ? (t('posMainDevice') || '메인') : (t('posOrderTerminal') || '주문')}
            </span>
          </Button>
        )}
      </div>

      <h1 className="min-w-0 truncate px-1 text-center text-sm font-bold leading-tight text-foreground sm:text-base lg:text-lg">
        {title}
      </h1>

      <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 lg:gap-4">
        {onPrefetchOfflineData && !showStoreSelect && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 border-emerald-600/40 px-2 text-emerald-800 hover:bg-emerald-50 sm:px-3"
            disabled={prefetchOfflineDataBusy}
            title={offlinePrefetchTitle}
            onClick={() => onPrefetchOfflineData()}
          >
            <HardDriveDownload className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">
              {prefetchOfflineDataBusy ? t("posOfflinePrefetching") : t("posOfflinePrefetch")}
            </span>
          </Button>
        )}
        <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
          <SelectTrigger className="h-8 w-[5.5rem] gap-1 sm:w-[100px]" aria-label={t('posLanguage')}>
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
        <span className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground sm:text-base lg:text-lg">
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
