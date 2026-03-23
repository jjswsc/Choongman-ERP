'use client'

import { useMemo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { PosTableItem } from '@/lib/api-client'
import { translateReceiptTableDisplayName } from '@/lib/pos-print-translate'

const FLOOR_W = 720
const FLOOR_H = 480
const SEAT_R = 6
const SEAT_INSET = 6
/** 포스 테이블 현황에서만 표시 크기 확대 (저장 좌표는 그대로, 중심 기준) */
const TABLE_FLOOR_DISPLAY_SCALE = 1.3

/** 조리중 구간: 0~10분 연두, 10~15분 주황, 15분~ 빨강 */
export type TableStatus = 'preparing' | 'partial_served' | 'completed' | null
export type TableStatusStage = 'fresh' | 'warning' | 'urgent'

export type TableStatusResult =
  | TableStatus
  | { status: TableStatus; createdAt?: string; targetMin?: number; guestCount?: number }

/** 관리자 화면과 동일하게 좌석 원을 위/아래에 배치 */
function getSeatPositions(w: number, h: number, n: number): { x: number; y: number }[] {
  if (n <= 0) return []
  const r = SEAT_R
  const inset = SEAT_INSET
  const nTop = Math.ceil(n / 2)
  const nBottom = n - nTop
  const minX = r + inset
  const maxX = Math.max(minX, w - r - inset)
  const positions: { x: number; y: number }[] = []
  for (let i = 0; i < nTop; i++) {
    const t = nTop === 1 ? 0.5 : i / (nTop - 1)
    positions.push({ x: minX + (maxX - minX) * t, y: r + inset })
  }
  for (let i = 0; i < nBottom; i++) {
    const t = nBottom === 1 ? 0.5 : i / (nBottom - 1)
    positions.push({ x: minX + (maxX - minX) * t, y: h - r - inset })
  }
  return positions
}

export interface TableFloorViewProps {
  /** 관리자 테이블 배치와 동일한 픽셀 좌표 레이아웃 */
  layout: PosTableItem[]
  /** 테이블 id 또는 name 기준 사용 중 여부 (deprecated: use getTableStatus) */
  getIsOccupied?: (id: string, name: string) => boolean
  /** 테이블별 상태 (createdAt 있으면 조리중 구간별 색상: 연두→주황→빨강) */
  getTableStatus?: (id: string, name: string) => TableStatusResult
  selectedTableId?: string | null
  onTableSelect?: (tableId: string) => void
  className?: string
  /** 라벨용 t 함수 (조리중, 서빙완료) */
  t?: (key: string) => string
  freshMaxMin?: number
  warningMaxMin?: number
  ruleMode?: 'elapsed' | 'recipe_diff'
  recipeWarningDiffMin?: number
  recipeUrgentDiffMin?: number
  delayBadgeEnabled?: boolean
  delaySoundEnabled?: boolean
  delayAlertOverMin?: number
  activeFloor?: 1 | 2 | 3
  onFloorChange?: (floor: 1 | 2 | 3) => void
  /** 그리드 배경 칸 수 — 720×480 픽셀 그리드와 맞추려면 30×20 (24px 칸) */
  gridCols?: number
  gridRows?: number
  /** 테이블 현황 필터: 준비중 / 결제완료 / 전체 (null이면 전체) */
  tableListMode?: 'in_progress' | 'completed' | 'all' | null
}

function getPreparingStageByElapsed(createdAt: string | undefined, freshMaxMin: number, warningMaxMin: number): TableStatusStage {
  if (!createdAt) return 'fresh'
  const ms = Date.now() - new Date(createdAt).getTime()
  const minutes = ms / 60000
  if (minutes >= warningMaxMin) return 'urgent'
  if (minutes >= freshMaxMin) return 'warning'
  return 'fresh'
}

function getPreparingStageByRecipeDiff(
  createdAt: string | undefined,
  targetMin: number | undefined,
  warningDiffMin: number,
  urgentDiffMin: number
): TableStatusStage {
  if (!createdAt || !targetMin || targetMin <= 0) return 'fresh'
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000
  const diff = elapsed - targetMin
  if (diff >= urgentDiffMin) return 'urgent'
  if (diff >= warningDiffMin) return 'warning'
  return 'fresh'
}

function formatTableTime(createdAt?: string): string {
  if (!createdAt) return ''
  try {
    const d = new Date(createdAt)
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok',
    })
  } catch {
    return ''
  }
}

function getElapsedMinutes(createdAt?: string): number {
  if (!createdAt) return 0
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / 60000))
}

function getDelayOverMinutes(params: {
  stage: TableStatusStage | null
  elapsedMin: number
  targetMin: number
  ruleMode: 'elapsed' | 'recipe_diff'
  warningMaxMin: number
  recipeUrgentDiffMin: number
}): number {
  const { stage, elapsedMin, targetMin, ruleMode, warningMaxMin, recipeUrgentDiffMin } = params
  if (stage !== 'urgent') return -1
  if (ruleMode === 'recipe_diff' && targetMin > 0) {
    return elapsedMin - targetMin - recipeUrgentDiffMin
  }
  return elapsedMin - warningMaxMin
}

/** 관리자(테이블 구성)와 동일한 720×480 비율·스타일로 테이블을 그립니다. */
export function TableFloorView({
  layout,
  getIsOccupied = () => false,
  getTableStatus,
  selectedTableId,
  onTableSelect,
  className,
  t = (k: string) => k,
  freshMaxMin = 10,
  warningMaxMin = 15,
  ruleMode = 'elapsed',
  recipeWarningDiffMin = 0,
  recipeUrgentDiffMin = 5,
  delayBadgeEnabled = true,
  delaySoundEnabled = false,
  delayAlertOverMin = 0,
  activeFloor = 1,
  onFloorChange,
  gridCols = 30,
  gridRows = 20,
  tableListMode = 'all',
}: TableFloorViewProps) {
  const [, setTick] = useState(0)
  const availableFloors = useMemo<(1 | 2 | 3)[]>(() => {
    const floors = Array.from(
      new Set(layout.map((item) => Math.min(3, Math.max(1, Number(item.floor ?? 1) || 1)) as 1 | 2 | 3))
    ).sort((a, b) => a - b)
    return floors.length > 0 ? floors : [1]
  }, [layout])

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const tableStyles = useMemo(() => {
    return layout
      .filter((item) => Math.min(3, Math.max(1, Number(item.floor ?? 1) || 1)) === activeFloor)
      .filter((item) => {
        if (!tableListMode || tableListMode === 'all') return true
        const raw = getTableStatus?.(item.id, String(item.name ?? '').trim() || item.id)
        const status: TableStatus =
          raw == null
            ? (getIsOccupied(item.id, String(item.name ?? '').trim() || item.id) ? 'preparing' : null)
            : typeof raw === 'object'
              ? raw.status
              : raw
        if (tableListMode === 'in_progress') return status === 'preparing' || status === 'partial_served'
        if (tableListMode === 'completed') return status === 'completed'
        return true
      })
      .map((item) => {
        const baseLeft = ((Number(item.x ?? 0) || 0) / FLOOR_W) * 100
        const baseTop = ((Number(item.y ?? 0) || 0) / FLOOR_H) * 100
        const baseW = ((Number(item.w ?? 80) || 80) / FLOOR_W) * 100
        const baseH = ((Number(item.h ?? 60) || 60) / FLOOR_H) * 100
        const cx = baseLeft + baseW / 2
        const cy = baseTop + baseH / 2
        const widthPct = baseW * TABLE_FLOOR_DISPLAY_SCALE
        const heightPct = baseH * TABLE_FLOOR_DISPLAY_SCALE
        return {
          id: item.id,
          name: String(item.name ?? '').trim() || item.id,
          leftPct: cx - widthPct / 2,
          topPct: cy - heightPct / 2,
          widthPct,
          heightPct,
          w: Number(item.w ?? 80) || 80,
          h: Number(item.h ?? 60) || 60,
          rotation: Number(item.rotation) || 0,
          shape: String(item.shape ?? 'rect'),
          seats: Number(item.seats ?? 0) || 0,
        }
      })
  }, [layout, activeFloor, tableListMode, getTableStatus, getIsOccupied])

  const delayedCount = (() => {
    return tableStyles.reduce((acc, tab) => {
      const raw = getTableStatus?.(tab.id, tab.name)
      const status: TableStatus =
        raw == null
          ? (getIsOccupied(tab.id, tab.name) ? 'preparing' : null)
          : typeof raw === 'object'
            ? raw.status
            : raw
      if (status !== 'preparing') return acc
      const createdAt = typeof raw === 'object' && raw?.createdAt ? raw.createdAt : undefined
      const targetMin = typeof raw === 'object' ? Number(raw?.targetMin ?? 0) : 0
      const stage: TableStatusStage =
        ruleMode === 'recipe_diff' && targetMin > 0
          ? getPreparingStageByRecipeDiff(createdAt, targetMin, recipeWarningDiffMin, recipeUrgentDiffMin)
          : getPreparingStageByElapsed(createdAt, freshMaxMin, warningMaxMin)
      const elapsedMin = getElapsedMinutes(createdAt)
      const delayOver = getDelayOverMinutes({
        stage,
        elapsedMin,
        targetMin,
        ruleMode,
        warningMaxMin,
        recipeUrgentDiffMin,
      })
      return delayOver >= delayAlertOverMin ? acc + 1 : acc
    }, 0)
  })()

  useEffect(() => {
    if (!delaySoundEnabled) return
    if (delayedCount <= 0) return
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.value = 0.02
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      setTimeout(() => {
        osc.stop()
        void audioCtx.close()
      }, 180)
    } catch {
      // no-op: audio context may fail without user gesture
    }
  }, [delaySoundEnabled, delayedCount])

  return (
    <div
      className={cn(
        'relative w-full rounded-xl border-2 border-slate-200 bg-slate-100 overflow-hidden',
        className
      )}
      style={{ aspectRatio: `${FLOOR_W} / ${FLOOR_H}` }}
    >
      {!!onFloorChange && (
        <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-md border border-slate-300 bg-white/90 p-1 shadow-sm">
          {availableFloors.map((floor) => (
            <button
              key={floor}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onFloorChange(floor as 1 | 2 | 3)
              }}
              className={cn(
                'rounded px-2 py-1 text-[11px] font-medium',
                activeFloor === floor ? 'bg-primary text-primary-foreground' : 'text-slate-700 hover:bg-slate-100'
              )}
            >
              {(t('posFloorLabel') || 'Floor {n}').replaceAll('{n}', String(floor))}
            </button>
          ))}
        </div>
      )}
      {/* 그리드 배경 — gridCols×gridRows 칸에 맞춰 테이블과 정렬 */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #94a3b8 1px, transparent 1px),
            linear-gradient(to bottom, #94a3b8 1px, transparent 1px)
          `,
          backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
        }}
      />
      {tableStyles.map((tab) => {
        const isSquare = tab.shape === 'square'
        const isRound = tab.shape === 'round'
        const raw = getTableStatus?.(tab.id, tab.name)
        const status: TableStatus =
          raw == null
            ? (getIsOccupied(tab.id, tab.name) ? 'preparing' : null)
            : typeof raw === 'object'
              ? raw.status
              : raw
        const createdAt = typeof raw === 'object' && raw?.createdAt ? raw.createdAt : undefined
        const targetMin = typeof raw === 'object' ? Number(raw?.targetMin ?? 0) : 0
        const tableGuestCount =
          typeof raw === 'object' && raw != null
            ? Math.max(0, Math.trunc(Number((raw as { guestCount?: number }).guestCount ?? 0)))
            : 0
        const stage = status === 'preparing'
          ? (ruleMode === 'recipe_diff' && targetMin > 0
              ? getPreparingStageByRecipeDiff(createdAt, targetMin, recipeWarningDiffMin, recipeUrgentDiffMin)
              : getPreparingStageByElapsed(createdAt, freshMaxMin, warningMaxMin))
          : null
        const elapsedMin = getElapsedMinutes(createdAt)
        const delayOver = getDelayOverMinutes({
          stage,
          elapsedMin,
          targetMin,
          ruleMode,
          warningMaxMin,
          recipeUrgentDiffMin,
        })
        const showDelayBadge = Boolean(delayBadgeEnabled && delayOver >= delayAlertOverMin && status === 'preparing')
        const elapsedClass =
          stage === 'urgent'
            ? 'bg-red-900/80 text-red-100'
            : stage === 'warning'
              ? 'bg-amber-900/80 text-amber-100'
              : status === 'completed'
                ? 'bg-slate-800/80 text-slate-100'
                : status === 'partial_served'
                  ? 'bg-sky-900/80 text-sky-100'
                : 'bg-lime-900/80 text-lime-100'
        const isOccupied = status !== null

        const tableSurfaceClass = cn(
          'absolute inset-0 shadow-sm border-2 border-dashed box-border',
          isRound ? 'rounded-full' : 'rounded-xl',
          isSquare && !isOccupied && 'bg-stone-500/90 border-stone-600',
          !isSquare && !isRound && !isOccupied && 'bg-[#d4a574] border-amber-800/40',
          isRound && !isOccupied && 'bg-[#d4a574] border-amber-800/40',
          status === 'preparing' && stage === 'fresh' && 'bg-lime-400/95 border-lime-600 ring-2 ring-lime-600/80',
          status === 'preparing' && stage === 'warning' && 'bg-amber-500/90 border-amber-600 ring-2 ring-amber-600/80',
          status === 'preparing' && stage === 'urgent' && 'bg-red-500/90 border-red-600 ring-2 ring-red-600/80',
          status === 'partial_served' && 'bg-sky-400/95 border-sky-600 ring-2 ring-sky-600/80',
          status === 'completed' && 'bg-slate-500/90 border-slate-600 ring-2 ring-slate-600/80'
        )

        const labelTextClass = cn(
          'absolute inset-0 z-[12] flex flex-col items-center justify-center gap-1 pointer-events-none px-1 text-center antialiased',
          /** 밝은 테이블 면 위에서도 글자가 잘 보이도록 */
          '[text-shadow:0_1px_2px_rgba(0,0,0,0.45)]',
          isSquare && !isOccupied && 'text-white',
          !isSquare && !isRound && !isOccupied && 'text-stone-800',
          isRound && !isOccupied && 'text-stone-800',
          status === 'preparing' && stage === 'fresh' && 'text-lime-950',
          status === 'preparing' && stage === 'warning' && 'text-amber-950',
          status === 'preparing' && stage === 'urgent' && 'text-red-950',
          status === 'partial_served' && 'text-sky-950',
          status === 'completed' && 'text-slate-100 [text-shadow:0_1px_3px_rgba(0,0,0,0.75)]'
        )

        const rot = Number(tab.rotation) || 0

        return (
          <div
            key={tab.id}
            role="button"
            tabIndex={0}
            onClick={() => onTableSelect?.(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onTableSelect?.(tab.id)
              }
            }}
            className={cn(
              'absolute cursor-pointer select-none transition-all overflow-visible box-border rounded-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              selectedTableId === tab.id &&
                'ring-2 ring-emerald-500 ring-offset-2 border-solid border-emerald-600 z-10',
              'hover:shadow-md active:scale-[0.98]'
            )}
            style={{
              left: `${tab.leftPct}%`,
              top: `${tab.topPct}%`,
              width: `${tab.widthPct}%`,
              height: `${tab.heightPct}%`,
              boxSizing: 'border-box',
            }}
          >
            {/* 테이블 면·좌석만 회전 (관리자에서 설정한 각도) */}
            <div
              className={tableSurfaceClass}
              style={{
                transform: `rotate(${rot}deg)`,
                transformOrigin: 'center center',
                boxShadow: !isSquare ? 'inset 0 1px 2px rgba(255,255,255,0.3)' : undefined,
              }}
            >
              {tab.seats > 0 &&
                getSeatPositions(tab.w, tab.h, tab.seats).map((pos, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'absolute rounded-full pointer-events-none shadow-sm',
                      isSquare
                        ? 'bg-stone-400/90 border border-stone-500'
                        : 'bg-[#c9a86c] border border-amber-800/50'
                    )}
                    style={{
                      left: `calc(${(pos.x / Math.max(tab.w, 1)) * 100}% - ${SEAT_R}px)`,
                      top: `calc(${(pos.y / Math.max(tab.h, 1)) * 100}% - ${SEAT_R}px)`,
                      width: SEAT_R * 2,
                      height: SEAT_R * 2,
                    }}
                  />
                ))}
            </div>
            {/* 글자는 항상 가로 유지 (테이블 면만 회전) */}
            <div
              className={labelTextClass}
              style={{ writingMode: 'horizontal-tb' }}
            >
              {/* 1줄: 테이블 번호 · 조리중(또는 일부 서빙/서빙 완료) · 빈 테이블은 좌석 */}
              <div className="flex min-w-0 max-w-full flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-0.5 leading-tight">
                <span className="max-w-[min(100%,8rem)] shrink truncate text-sm font-extrabold tracking-tight sm:text-base">
                  {translateReceiptTableDisplayName(tab.name, t)}
                </span>
                {isOccupied && (
                  <>
                    <span className="shrink-0 text-sm font-bold opacity-70 sm:text-base" aria-hidden>
                      ·
                    </span>
                    {status === 'preparing' && (
                      <span className="text-xs font-bold sm:text-sm">
                        {t('posTableStatusPreparing') || '조리중'}
                      </span>
                    )}
                    {status === 'partial_served' && (
                      <span className="text-xs font-bold sm:text-sm">
                        {t('posTableStatusPartiallyServed') || '일부 서빙'}
                      </span>
                    )}
                    {status === 'completed' && (
                      <span className="text-xs font-bold sm:text-sm">
                        {t('posTableStatusServed') || '서빙 완료'}
                      </span>
                    )}
                    {tableGuestCount > 0 && (
                        <>
                          <span className="shrink-0 text-sm font-bold opacity-70 sm:text-base" aria-hidden>
                            ·
                          </span>
                          <span className="text-xs font-extrabold tabular-nums sm:text-sm" title={t('posOrderGuestCount') || ''}>
                            {tableGuestCount}
                            {t('posPeopleUnit') || ''}
                          </span>
                        </>
                      )}
                  </>
                )}
                {!isOccupied && tab.seats > 0 && (
                  <>
                    <span className="shrink-0 text-sm font-bold opacity-70 sm:text-base" aria-hidden>
                      ·
                    </span>
                    <span className="text-xs font-semibold opacity-95 sm:text-sm">
                      {tab.seats}
                      {t('posTableSeatsUnit') || '인'}
                    </span>
                  </>
                )}
              </div>

              {/* 2줄: 지연 + 경과 시간 */}
              {isOccupied && createdAt && (
                <div className="flex max-w-full flex-row flex-wrap items-center justify-center gap-1.5 px-0.5 text-xs tabular-nums leading-tight sm:text-sm">
                  {showDelayBadge && (
                    <span className="rounded-md bg-red-900/95 px-1.5 py-0.5 text-[11px] font-extrabold text-red-50 shadow-sm sm:text-xs">
                      {t('posDelayBadge') || '지연'}
                    </span>
                  )}
                  {showDelayBadge && (
                    <span className="shrink-0 font-bold opacity-70" aria-hidden>
                      ·
                    </span>
                  )}
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-1 font-extrabold tabular-nums shadow-sm',
                      elapsedClass
                    )}
                    title={t('posTableElapsedHint') || '경과(분)'}
                  >
                    {elapsedMin}
                    {t('posMinuteUnit') || '분'}
                  </span>
                </div>
              )}

              {/* 3줄: 주문 시간 */}
              {isOccupied && createdAt && (
                <div className="flex max-w-full items-center justify-center px-0.5 text-xs font-semibold tabular-nums leading-tight opacity-95 sm:text-sm">
                  <span title={t('posTableOrderClockHint') || '주문 시각'}>
                    {formatTableTime(createdAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
