'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export type OrderBarStatus = 'preparing' | 'partial_served' | 'completed' | null
type OrderBarStage = 'fresh' | 'warning' | 'urgent'

export interface OrderBarItem {
  id: string
  label: string
  status: OrderBarStatus
  createdAt?: string
  targetMin?: number
  subLabel?: string
  rightLabel?: string
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
}: OrderBarListProps) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="h-full rounded-xl border-2 border-slate-200 bg-slate-100 p-2 overflow-auto">
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

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect?.(item.id)}
              className={cn(
                'w-full rounded-lg border px-3 text-left transition shadow-sm touch-manipulation',
                touchMode === 'large' ? 'py-3.5 min-h-[68px]' : 'py-2 min-h-[50px]',
                item.status == null && 'bg-white border-slate-300 text-slate-800',
                item.status === 'preparing' && stage === 'fresh' && 'bg-lime-400/95 border-lime-600 text-lime-950',
                item.status === 'preparing' && stage === 'warning' && 'bg-amber-500/90 border-amber-600 text-amber-950',
                item.status === 'preparing' && stage === 'urgent' && 'bg-red-500/90 border-red-600 text-red-950',
                item.status === 'partial_served' && 'bg-sky-400/95 border-sky-600 text-sky-950',
                item.status === 'completed' && 'bg-slate-500/90 border-slate-600 text-slate-100',
                selectedId === item.id && 'ring-2 ring-emerald-500 ring-offset-2'
              )}
            >
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
                  {item.status === 'preparing' || item.status === 'partial_served' || item.status === 'completed' ? (
                    <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                      {elapsedMin}{t('posMinuteUnit') || '분'}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

