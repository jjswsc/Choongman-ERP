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
import { Home, ArrowLeft, Settings, RefreshCw, Monitor, Smartphone, LayoutDashboard } from "lucide-react"
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
  title?: string
  className?: string
  /** POS 터미널 데모 투어 `data-tour` (예: `pos-tour-header`) */
  dataTour?: string
  /** 메인 포스 모드 (프린터 연결, 태블릿 주문 수신 인쇄) */
  isMainPosDevice?: boolean
  onMainPosDeviceChange?: (value: boolean) => void
  /** true면 POS에서 메인/주문 토글 숨김(관리자 지정만) */
  mainDeviceRoleLocked?: boolean
}

export function POSHeader({
  stores = [],
  currentStoreId = "",
  onStoreChange,
  todayCompleted: _todayCompleted,
  totalSales,
  todayOrders: _todayOrders = 0,
  totalAmount = 0,
  showBackToAdmin: _showBackToAdmin = false,
  showBackButton = true,
  onBack,
  showAdminNavButton = false,
  onAdminNav,
  canAccessAdmin: canAccessAdminProp = true,
  canChangeStore = true,
  onRefresh,
  title = "POS",
  className,
  dataTour,
  isMainPosDevice,
  onMainPosDeviceChange,
  mainDeviceRoleLocked = false,
}: PosHeaderProps) {
  const router = useRouter()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const sales = totalSales ?? totalAmount
  const showStoreSelect = canChangeStore && stores.length > 0 && currentStoreId && onStoreChange

  /** POS 헤더 새로고침 — ghost보다 눈에 띄게 (테두리·포인트색·최소 터치 높이) */
  const refreshButtonClassName =
    "h-9 min-h-[44px] shrink-0 gap-1.5 border-2 border-primary/45 bg-primary/5 px-2.5 font-semibold text-primary shadow-sm hover:bg-primary/15 dark:border-primary/55 dark:bg-primary/15 dark:hover:bg-primary/25 sm:h-8 sm:min-h-0 sm:px-3"
  const handleRefreshClick = () => {
    if (!onRefresh) {
      window.location.reload()
      return
    }
    try {
      const maybePromise = onRefresh()
      Promise.resolve(maybePromise)
        .then(() => {
          router.refresh()
        })
        .catch(() => {
          window.location.reload()
        })
    } catch {
      window.location.reload()
    }
  }

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
      data-tour={dataTour}
      className={cn(
        "grid min-h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 border-b border-border bg-card px-2 py-2 sm:gap-x-2 sm:px-3 md:px-4 lg:h-14 lg:gap-x-3 lg:py-0",
        className
      )}
    >
      <div className="flex min-w-0 flex-nowrap items-center gap-x-1 overflow-x-auto sm:gap-x-1.5 md:gap-x-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                type="button"
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
          <div className="flex min-w-0 max-w-full items-center gap-1 sm:gap-2">
            <Select value={currentStoreId} onValueChange={onStoreChange}>
              <SelectTrigger className="h-8 w-[min(140px,28vw)] sm:w-[160px]">
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
              variant="outline"
              size="sm"
              type="button"
              title={t('posRefresh')}
              aria-label={t('posRefresh')}
              className={refreshButtonClassName}
              onClick={handleRefreshClick}
            >
              <RefreshCw className="h-[1.125rem] w-[1.125rem] shrink-0 sm:mr-1" aria-hidden />
              <span className="hidden min-[400px]:inline">{t('posRefresh')}</span>
            </Button>
          </div>
        )}

        {typeof isMainPosDevice === 'boolean' &&
          (mainDeviceRoleLocked ? (
            <span
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-xs sm:gap-1.5 sm:px-3',
                isMainPosDevice
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-muted/40 text-muted-foreground'
              )}
              title={
                isMainPosDevice
                  ? t('posMainDeviceOn') || '메인 포스 (프린터 연결)'
                  : t('posOrderTerminal') || '주문 단말'
              }
            >
              {isMainPosDevice ? (
                <Monitor className="h-3.5 w-3.5" />
              ) : (
                <Smartphone className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {isMainPosDevice
                  ? t('posMainDevice') || '메인'
                  : t('posOrderTerminal') || '주문'}
              </span>
            </span>
          ) : (
            onMainPosDeviceChange && (
              <Button
                type="button"
                variant={isMainPosDevice ? 'default' : 'outline'}
                size="sm"
                className="h-8 shrink-0 gap-1 sm:gap-1.5"
                data-tour={dataTour ? 'pos-tour-main-device-toggle' : undefined}
                onClick={() => onMainPosDeviceChange(!isMainPosDevice)}
                title={
                  isMainPosDevice
                    ? t('posMainDeviceOn') || '메인 포스 (프린터 연결)'
                    : t('posMainDeviceOff') || '주문 단말'
                }
              >
                {isMainPosDevice ? (
                  <Monitor className="h-3.5 w-3.5" />
                ) : (
                  <Smartphone className="h-3.5 w-3.5" />
                )}
                <span className="hidden text-xs sm:inline">
                  {isMainPosDevice
                    ? t('posMainDevice') || '메인'
                    : t('posOrderTerminal') || '주문'}
                </span>
              </Button>
            )
          ))}

        {/* 매장 선택기가 없을 때(단일 매장 등)에도 테이블·주문 데이터 새로고침 가능 */}
        {!showStoreSelect && (
          <Button
            variant="outline"
            size="sm"
            className={refreshButtonClassName}
            type="button"
            title={t('posRefresh')}
            aria-label={t('posRefresh')}
            data-tour={dataTour ? 'pos-tour-header-refresh' : undefined}
            onClick={handleRefreshClick}
          >
            <RefreshCw className="h-[1.125rem] w-[1.125rem] shrink-0 sm:mr-1" aria-hidden />
            <span className="hidden min-[400px]:inline">{t('posRefresh')}</span>
          </Button>
        )}
      </div>

      <h1 className="min-w-0 max-w-full justify-self-center truncate px-0.5 text-center text-xs font-bold leading-tight text-foreground sm:px-1 sm:text-sm md:text-base lg:text-lg">
        {title}
      </h1>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 overflow-x-auto sm:gap-1.5 md:gap-2 lg:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
          <SelectTrigger className="h-8 w-[7rem] shrink-0 sm:w-[8rem] md:w-[8.5rem]" aria-label={t('posLanguage')}>
            <SelectValue placeholder={`🌐 ${t('posLanguage')}`} />
          </SelectTrigger>
          <SelectContent>
            {langOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                🌐 {t(opt.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-foreground sm:text-sm md:text-base lg:text-lg">
          {sales.toLocaleString()} ฿
        </span>
        {canAccessAdminProp && (
          <Link href="/admin/pos-screen-config">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}
