'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useLang, type LangCode } from '@/lib/lang-context'
import { formatPosTimeHm24Bangkok } from '@/lib/pos-datetime-locale'
import { getOrderBarCookElapsedMinutes } from '@/lib/pos-order-bar-cook-elapsed'
import {
  POS_PANEL_SHELL_CLASS,
  posCookStageOrderBarCardClass,
  posCookStagePillClass,
} from '@/lib/pos-ui-tokens'

export type OrderBarStatus = 'pending' | 'preparing' | 'partial_served' | 'packaged' | 'completed' | null
type OrderBarStage = 'fresh' | 'warning' | 'urgent'

export type DeliveryAppAccent = 'grab' | 'lineman' | 'shopee' | 'lime' | 'sky' | 'amber' | 'slate'

export interface OrderBarItem {
  id: string
  label: string
  status: OrderBarStatus
  createdAt?: string
  targetMin?: number
  subLabel?: string
  rightLabel?: string
  /** POS 내부 주문번호(영수증/주문관리와 동일 포맷) — 배달 카드 본문 표시용 */
  posOrderNo?: string
  /** 플랫폼 단축 주문번호(예: Grab #GF-1234) — 보조 표시용 */
  platformOrderNo?: string
  /** 배달 주문 시 플랫폼별 구분 (코드 또는 accent 색상) */
  deliveryAppAccent?: DeliveryAppAccent
  /** 배달앱 표시명 (설정 기반) */
  deliveryAppName?: string
  /** 결제 완료 등 Cook 경과 분 계산 종료 시각(ISO) */
  elapsedEndAt?: string
}

interface OrderBarListProps {
  items: OrderBarItem[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  t?: (key: string) => string
  freshMaxMin?: number
  warningMaxMin?: number
  ruleMode?: 'elapsed' | 'recipe_diff'
  recipeWarningDiffMin?: number
  recipeUrgentDiffMin?: number
  delayBadgeEnabled?: boolean
  delayAlertOverMin?: number
  touchMode?: 'default' | 'large'
  /** 배달/포장일 때 partial_served를 "일부포장"으로 표시 */
  usePackagingLabel?: boolean
  className?: string
}

function getPreparingStageByElapsed(createdAt: string | undefined, freshMaxMin: number, warningMaxMin: number): OrderBarStage {
  if (!createdAt) return 'fresh'
  const minutes = (Date.now() - new Date(createdAt).getTime()) / 60000
  if (minutes >= warningMaxMin) return 'urgent'
  if (minutes >= freshMaxMin) return 'warning'
  return 'fresh'
}

function getPreparingStageByRecipeDiff(
  createdAt: string | undefined,
  targetMin: number | undefined,
  warningDiffMin: number,
  urgentDiffMin: number
): OrderBarStage {
  if (!createdAt || !targetMin || targetMin <= 0) return 'fresh'
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000
  const diff = elapsed - targetMin
  if (diff >= urgentDiffMin) return 'urgent'
  if (diff >= warningDiffMin) return 'warning'
  return 'fresh'
}

function getDelayOverMinutes(params: {
  stage: OrderBarStage | null
  elapsedMin: number
  targetMin: number
  ruleMode: 'elapsed' | 'recipe_diff'
  warningMaxMin: number
  recipeUrgentDiffMin: number
}): number {
  const { stage, elapsedMin, targetMin, ruleMode, warningMaxMin, recipeUrgentDiffMin } = params
  if (stage !== 'urgent') return -1
  if (ruleMode === 'recipe_diff' && targetMin > 0) return elapsedMin - targetMin - recipeUrgentDiffMin
  return elapsedMin - warningMaxMin
}

function formatOrderTime(createdAt: string | undefined, lang: LangCode): string {
  if (!createdAt) return '--:--'
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return '--:--'
  return formatPosTimeHm24Bangkok(d, lang)
}

export function OrderBarList({
  items,
  selectedId,
  onSelect,
  t = (k: string) => k,
  freshMaxMin = 10,
  warningMaxMin = 15,
  ruleMode = 'elapsed',
  recipeWarningDiffMin = 0,
  recipeUrgentDiffMin = 5,
  delayBadgeEnabled = true,
  delayAlertOverMin = 0,
  touchMode = 'default',
  usePackagingLabel = false,
  className,
}: OrderBarListProps) {
  const { lang } = useLang()
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={cn('h-full overflow-auto p-2', POS_PANEL_SHELL_CLASS, className)}>
      <div className="space-y-2">
        {items.map((item) => {
          const targetMin = Number(item.targetMin ?? 0)
          const stage = item.status === 'preparing'
            ? (ruleMode === 'recipe_diff' && targetMin > 0
                ? getPreparingStageByRecipeDiff(item.createdAt, targetMin, recipeWarningDiffMin, recipeUrgentDiffMin)
                : getPreparingStageByElapsed(item.createdAt, freshMaxMin, warningMaxMin))
            : null
          const elapsedMin = getOrderBarCookElapsedMinutes(item.createdAt, item.elapsedEndAt)
          const showCookElapsed =
            item.status === 'preparing' ||
            item.status === 'partial_served' ||
            item.status === 'packaged' ||
            (item.status === 'completed' && Boolean(item.elapsedEndAt))
          const delayOver = getDelayOverMinutes({
            stage,
            elapsedMin,
            targetMin,
            ruleMode,
            warningMaxMin,
            recipeUrgentDiffMin,
          })
          const showDelayBadge = Boolean(delayBadgeEnabled && delayOver >= delayAlertOverMin && item.status === 'preparing')

          const isDeliveryWithAccent = Boolean(item.deliveryAppAccent)
          const accentColor = item.deliveryAppAccent === 'grab' || item.deliveryAppAccent === 'lime' ? 'grab' :
            item.deliveryAppAccent === 'lineman' || item.deliveryAppAccent === 'sky' ? 'lineman' :
            item.deliveryAppAccent === 'shopee' || item.deliveryAppAccent === 'amber' ? 'shopee' :
            item.deliveryAppAccent === 'slate' ? 'slate' : 'grab'
          const deliveryBorderClass = isDeliveryWithAccent ? (
            accentColor === 'grab' ? 'border-l-[6px] border-l-[#00B14F]' :
            accentColor === 'lineman' ? 'border-l-[6px] border-l-[#06C755]' :
            accentColor === 'shopee' ? 'border-l-[6px] border-l-[#EE4D2D]' :
            accentColor === 'slate' ? 'border-l-[6px] border-l-slate-400' : ''
          ) : ''
          const pillBadgeClass = item.status === 'completed'
            ? 'bg-slate-500 text-white ring-1 ring-slate-600/30'
            : item.status === 'packaged'
              ? 'bg-emerald-500 text-white ring-1 ring-emerald-600/30'
              : item.status === 'partial_served'
              ? 'bg-violet-500 text-white ring-1 ring-violet-600/30'
              : item.status === 'pending'
                ? 'bg-sky-600 text-white ring-1 ring-sky-700/30'
              : item.status === 'preparing' && stage === 'fresh'
                ? posCookStagePillClass.fresh
                : item.status === 'preparing' && stage === 'warning'
                  ? posCookStagePillClass.warning
                  : item.status === 'preparing' && stage === 'urgent'
                    ? posCookStagePillClass.urgent
                    : 'bg-slate-400 text-white ring-1 ring-slate-500/30'
          const statusLabel = item.status === 'completed' ? (t('posPaymentComplete') || '결제 완료') :
            item.status === 'packaged' ? (t('posDeliveryPackagingComplete') || '포장 완료') :
            item.status === 'partial_served' ? (usePackagingLabel ? (t('posPartiallyPackaged') || '일부 포장') : (t('posTableStatusPartiallyServed') || '일부서빙')) :
            item.status === 'pending' ? (t('posOrderBarPendingAccept') || '수락 대기') :
            item.status === 'preparing' ? (t('posOrderStatusPreparing') || '조리중') : null

          const platformLabel = item.deliveryAppName ?? (item.deliveryAppAccent === 'grab' ? 'Grab' :
            item.deliveryAppAccent === 'lineman' ? 'Line Man' :
            item.deliveryAppAccent === 'shopee' ? 'Shopee' : null)
          const platformBadgeClass = accentColor === 'grab' ? 'bg-[#00B14F] text-white ring-1 ring-[#008f41]/40' :
            accentColor === 'lineman' ? 'bg-[#06C755] text-white ring-1 ring-[#049a44]/40' :
            accentColor === 'shopee' ? 'bg-[#EE4D2D] text-white ring-1 ring-[#d73211]/40' :
            accentColor === 'slate' ? 'bg-slate-500 text-white ring-1 ring-slate-600/40' : ''

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item.id)}
              className={cn(
                'w-full rounded-lg border px-3 text-left shadow-sm touch-manipulation transition-all duration-200',
                'hover:shadow-md active:scale-[0.98]',
                touchMode === 'large' ? 'py-3.5 min-h-[68px]' : 'py-2 min-h-[50px]',
                isDeliveryWithAccent ? 'bg-white border-slate-200' : 'border-slate-300',
                !isDeliveryWithAccent && item.status == null && 'bg-white text-slate-800',
                !isDeliveryWithAccent && item.status === 'pending' && 'bg-sky-50 border-sky-400 text-sky-950',
                !isDeliveryWithAccent && item.status === 'preparing' && stage === 'fresh' && posCookStageOrderBarCardClass.fresh,
                !isDeliveryWithAccent && item.status === 'preparing' && stage === 'warning' && posCookStageOrderBarCardClass.warning,
                !isDeliveryWithAccent && item.status === 'preparing' && stage === 'urgent' && posCookStageOrderBarCardClass.urgent,
                !isDeliveryWithAccent && item.status === 'partial_served' && 'bg-violet-400/95 border-violet-600 text-violet-950',
                !isDeliveryWithAccent && item.status === 'packaged' && 'bg-emerald-500/90 border-emerald-600 text-emerald-50',
                !isDeliveryWithAccent && item.status === 'completed' && 'bg-slate-500/90 border-slate-600 text-slate-100',
                deliveryBorderClass,
                selectedId === item.id && 'ring-2 ring-emerald-500 ring-offset-2'
              )}
            >
              {isDeliveryWithAccent ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {platformLabel && (
                      <span className={cn('inline-flex items-center rounded-lg px-3 py-2 text-base font-extrabold shrink-0', platformBadgeClass)}>
                        {platformLabel}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-bold text-slate-800 truncate">
                        {item.platformOrderNo || item.posOrderNo || item.rightLabel || (item.deliveryAppAccent ? '' : item.label)}
                      </p>
                      {item.platformOrderNo && item.posOrderNo ? (
                        <p className="mt-0.5 text-xs font-semibold text-slate-600 truncate tabular-nums">
                          {item.posOrderNo}
                        </p>
                      ) : item.rightLabel && !item.platformOrderNo ? (
                        <p className="mt-0.5 text-xs font-semibold text-slate-600 truncate tabular-nums">
                          {item.rightLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums text-slate-600 shrink-0">
                      {formatOrderTime(item.createdAt, lang)}
                    </span>
                    {showCookElapsed && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-bold tabular-nums shrink-0 ring-1 ring-black/10 bg-slate-100 text-slate-700" title={t('posCookingElapsed') || '조리 경과'}>
                        {t('posCookingElapsed') || '조리'} {elapsedMin}{t('posMinuteUnit') || '분'}
                      </span>
                    )}
                    {statusLabel && (
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold shrink-0 ring-1 ring-black/10', pillBadgeClass)}>
                        {statusLabel}
                      </span>
                    )}
                    {showDelayBadge && (
                      <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white ring-1 ring-red-700/30 shrink-0">
                        {t('posDelayBadge') || '지연'}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn('truncate font-semibold', touchMode === 'large' ? 'text-base' : 'text-sm')}>{item.label}</p>
                    {item.subLabel ? (
                      <p className={cn('truncate opacity-85 mt-0.5', touchMode === 'large' ? 'text-xs' : 'text-[11px]')}>{item.subLabel}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.rightLabel ? (
                      <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                        {item.rightLabel}
                      </span>
                    ) : null}
                    {showDelayBadge ? (
                      <span className="rounded bg-red-900/90 px-1.5 py-0.5 text-[10px] font-bold text-red-100">
                        {t('posDelayBadge') || '지연'}
                      </span>
                    ) : null}
                    {showCookElapsed ? (
                      <>
                        <span className="text-[11px] tabular-nums opacity-80">{formatOrderTime(item.createdAt, lang)}</span>
                        <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums" title={t('posCookingElapsed') || '조리 경과'}>
                          {t('posCookingElapsed') || '조리'} {elapsedMin}{t('posMinuteUnit') || '분'}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

