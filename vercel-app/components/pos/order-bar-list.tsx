'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useLang, type LangCode } from '@/lib/lang-context'
import { formatPosTimeHm24Bangkok } from '@/lib/pos-datetime-locale'

export type OrderBarStatus = 'preparing' | 'partial_served' | 'packaged' | 'completed' | null
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
  /** 배달 주문 시 플랫폼별 구분 (코드 또는 accent 색상) */
  deliveryAppAccent?: DeliveryAppAccent
  /** 배달앱 표시명 (설정 기반) */
  deliveryAppName?: string
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

function getElapsedMinutes(createdAt?: string): number {
  if (!createdAt) return 0
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / 60000))
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
    <div className={cn('h-full rounded-xl border-2 border-slate-200 bg-slate-100 p-2 overflow-auto', className)}>
      <div className="space-y-2">
        {items.map((item) => {
          const targetMin = Number(item.targetMin ?? 0)
          const stage = item.status === 'preparing'
            ? (ruleMode === 'recipe_diff' && targetMin > 0
                ? getPreparingStageByRecipeDiff(item.createdAt, targetMin, recipeWarningDiffMin, recipeUrgentDiffMin)
                : getPreparingStageByElapsed(item.createdAt, freshMaxMin, warningMaxMin))
            : null
          const elapsedMin = getElapsedMinutes(item.createdAt)
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
          const accentColor = item.deliveryAppAccent === 'grab' || item.deliveryAppAccent === 'lime' ? 'lime' :
            item.deliveryAppAccent === 'lineman' || item.deliveryAppAccent === 'sky' ? 'sky' :
            item.deliveryAppAccent === 'shopee' || item.deliveryAppAccent === 'amber' ? 'amber' :
            item.deliveryAppAccent === 'slate' ? 'slate' : 'lime'
          const deliveryBorderClass = isDeliveryWithAccent ? (
            accentColor === 'lime' ? 'border-l-[6px] border-l-lime-500' :
            accentColor === 'sky' ? 'border-l-[6px] border-l-sky-400' :
            accentColor === 'amber' ? 'border-l-[6px] border-l-amber-400' :
            accentColor === 'slate' ? 'border-l-[6px] border-l-slate-400' : ''
          ) : ''
          const pillBadgeClass = item.status === 'completed'
            ? 'bg-slate-500 text-white ring-1 ring-slate-600/30'
            : item.status === 'packaged'
              ? 'bg-emerald-500 text-white ring-1 ring-emerald-600/30'
              : item.status === 'partial_served'
              ? 'bg-violet-500 text-white ring-1 ring-violet-600/30'
              : item.status === 'preparing' && stage === 'fresh'
                ? 'bg-lime-500 text-white ring-1 ring-lime-600/30'
                : item.status === 'preparing' && stage === 'warning'
                  ? 'bg-amber-500 text-white ring-1 ring-amber-600/30'
                  : item.status === 'preparing' && stage === 'urgent'
                    ? 'bg-red-500 text-white ring-1 ring-red-600/30'
                    : 'bg-slate-400 text-white ring-1 ring-slate-500/30'
          const statusLabel = item.status === 'completed' ? (t('posPaymentComplete') || '결제 완료') :
            item.status === 'packaged' ? (t('posDeliveryPackagingComplete') || '포장 완료') :
            item.status === 'partial_served' ? (usePackagingLabel ? (t('posPartiallyPackaged') || '일부 포장') : (t('posTableStatusPartiallyServed') || '일부서빙')) :
            item.status === 'preparing' ? (t('posOrderStatusPreparing') || '조리중') : null

          const platformLabel = item.deliveryAppName ?? (item.deliveryAppAccent === 'grab' ? 'Grab' :
            item.deliveryAppAccent === 'lineman' ? 'Line Man' :
            item.deliveryAppAccent === 'shopee' ? 'Shopee' : null)
          const platformBadgeClass = accentColor === 'lime' ? 'bg-lime-500 text-white ring-1 ring-lime-600/40' :
            accentColor === 'sky' ? 'bg-sky-500 text-white ring-1 ring-sky-600/40' :
            accentColor === 'amber' ? 'bg-amber-500 text-white ring-1 ring-amber-600/40' :
            accentColor === 'slate' ? 'bg-slate-500 text-white ring-1 ring-slate-600/40' : ''

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item.id)}
              className={cn(
                'w-full rounded-lg border px-3 text-left transition shadow-sm touch-manipulation',
                touchMode === 'large' ? 'py-3.5 min-h-[68px]' : 'py-2 min-h-[50px]',
                isDeliveryWithAccent ? 'bg-white border-slate-200' : 'border-slate-300',
                !isDeliveryWithAccent && item.status == null && 'bg-white text-slate-800',
                !isDeliveryWithAccent && item.status === 'preparing' && stage === 'fresh' && 'bg-lime-400/95 border-lime-600 text-lime-950',
                !isDeliveryWithAccent && item.status === 'preparing' && stage === 'warning' && 'bg-amber-500/90 border-amber-600 text-amber-950',
                !isDeliveryWithAccent && item.status === 'preparing' && stage === 'urgent' && 'bg-red-500/90 border-red-600 text-red-950',
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
                    <p className="text-lg font-bold text-slate-800 truncate min-w-0">
                      {item.rightLabel ?? (item.deliveryAppAccent ? '' : item.label)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm tabular-nums text-slate-600 shrink-0">
                      {formatOrderTime(item.createdAt, lang)}
                    </span>
                    {(item.status === 'preparing' || item.status === 'partial_served' || item.status === 'packaged' || item.status === 'completed') && (
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
                    {item.status === 'preparing' || item.status === 'partial_served' || item.status === 'packaged' || item.status === 'completed' ? (
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

