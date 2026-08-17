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
import { Home, ArrowLeft, Settings, RefreshCw, Monitor, Smartphone, LayoutDashboard, Lock } from "lucide-react"
import type { Store } from "@/lib/pos-types"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { navigatePosOfflineAware } from "@/lib/pos-offline-nav"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { appAlert } from "@/lib/app-message"

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

  /** POS 헤더 새로고침 — 다른 버튼과 높이를 맞추고, 좁은 폭에서는 아이콘만 */
  const refreshButtonClassName =
    "h-9 shrink-0 gap-1.5 border border-primary/40 bg-primary/5 px-2.5 font-semibold text-primary shadow-sm hover:bg-primary/10 dark:border-primary/50 dark:bg-primary/15 dark:hover:bg-primary/25 sm:h-8 sm:px-3"
  const handleRefreshClick = () => {
    if (!onRefresh) {
      window.location.reload()
      return
    }
    try {
      const maybePromise = onRefresh()
      Promise.resolve(maybePromise).catch(() => {
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

  const refreshLabelClassName = "hidden @min-[960px]/poshdr:inline"

  return (
    <header
      data-tour={dataTour}
      className={cn(
        "@container/poshdr isolate flex min-h-14 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-card px-2 py-1.5 sm:gap-3 sm:px-3 md:px-4 lg:h-14 lg:py-0",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 sm:h-8 sm:w-8"
          title={t('posHome') || '포스 첫 화면'}
          onClick={() => navigatePosOfflineAware('/pos', (p) => router.push(p))}
        >
          <Home className="w-4 h-4" />
        </Button>
        {showAdminNavButton && onAdminNav ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 border-primary/30 px-2 text-primary hover:bg-primary/5 sm:h-8 sm:px-2.5"
            type="button"
            onClick={onAdminNav}
            title={t("posNavAdmin") || "관리자"}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="hidden text-xs font-medium @min-[720px]/poshdr:inline">{t("posNavAdmin") || "관리자"}</span>
          </Button>
        ) : (
          showBackButton && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1 px-2 sm:h-8"
              onClick={() => (onBack ? onBack() : router.back())}
              title={t("posBack") || "뒤로가기"}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden @min-[720px]/poshdr:inline">{t("posBack") || "뒤로가기"}</span>
            </Button>
          )
        )}

        {showStoreSelect && (
          <Select value={currentStoreId} onValueChange={onStoreChange}>
            <SelectTrigger className="h-9 w-[7.5rem] shrink-0 sm:h-8 sm:w-[9.5rem]">
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
        )}

        <Button
          variant="outline"
          size="sm"
          type="button"
          title={t('posRefresh')}
          aria-label={t('posRefresh')}
          className={refreshButtonClassName}
          data-tour={dataTour ? 'pos-tour-header-refresh' : undefined}
          onClick={handleRefreshClick}
        >
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
          <span className={refreshLabelClassName}>{t('posRefresh')}</span>
        </Button>

        {typeof isMainPosDevice === 'boolean' &&
          (mainDeviceRoleLocked ? (
            <button
              type="button"
              className={cn(
                'inline-flex h-9 shrink-0 cursor-default items-center gap-1 rounded-md border px-2 text-xs sm:h-8 sm:gap-1.5 sm:px-2.5',
                isMainPosDevice
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-muted/40 text-muted-foreground'
              )}
              title={
                t('posTerminalRoleLimitsLockedHint') ||
                (isMainPosDevice
                  ? t('posMainDeviceOn') || '메인 포스 (프린터 연결)'
                  : t('posOrderTerminal') || '주문 단말')
              }
              onClick={() => {
                void appAlert(
                  t('posTerminalRoleLimitsLockedHint') ||
                    '현장 POS에서 메인/주문 변경이 잠겨 있습니다. 관리자 → POS 단말 설정 → 기기 목록에서 메인을 지정하거나 잠금을 해제하세요.'
                )
              }}
            >
              <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              {isMainPosDevice ? (
                <Monitor className="h-3.5 w-3.5" />
              ) : (
                <Smartphone className="h-3.5 w-3.5" />
              )}
              <span className="hidden @min-[800px]/poshdr:inline">
                {isMainPosDevice
                  ? t('posMainDevice') || '메인'
                  : t('posOrderTerminal') || '주문'}
              </span>
            </button>
          ) : (
            onMainPosDeviceChange && (
              <Button
                type="button"
                variant={isMainPosDevice ? 'default' : 'outline'}
                size="sm"
                className="h-9 shrink-0 gap-1 px-2 sm:h-8 sm:gap-1.5 sm:px-2.5"
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
                <span className="hidden text-xs @min-[800px]/poshdr:inline">
                  {isMainPosDevice
                    ? t('posMainDevice') || '메인'
                    : t('posOrderTerminal') || '주문'}
                </span>
              </Button>
            )
          ))}
      </div>

      <h1 className="hidden min-w-0 max-w-[9.5rem] truncate text-center text-sm font-bold leading-tight text-foreground @min-[880px]/poshdr:block md:max-w-[12rem] md:text-base lg:text-lg">
        {title}
      </h1>

      <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-2.5 md:gap-3">
        <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
          <SelectTrigger className="h-9 w-[6.75rem] shrink-0 sm:h-8 sm:w-[8rem]" aria-label={t('posLanguage')}>
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
        <span className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-foreground sm:text-sm md:text-base">
          {sales.toLocaleString()} ฿
        </span>
        {canAccessAdminProp && (
          <Link href="/admin/pos-screen-config">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}
