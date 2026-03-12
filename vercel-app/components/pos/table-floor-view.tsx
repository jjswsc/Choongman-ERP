'use client'

import { useMemo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { PosTableItem } from '@/lib/api-client'

const FLOOR_W = 720
const FLOOR_H = 480

/** 조리중 구간: 0~10분 연두, 10~15분 주황, 15분~ 빨강 */
export type TableStatus = 'preparing' | 'completed' | null
export type TableStatusStage = 'fresh' | 'warning' | 'urgent'

export type TableStatusResult =
  | TableStatus
  | { status: TableStatus; createdAt?: string }

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
}

function getPreparingStage(createdAt?: string): TableStatusStage {
  if (!createdAt) return 'fresh'
  const ms = Date.now() - new Date(createdAt).getTime()
  const minutes = ms / 60000
  if (minutes >= 15) return 'urgent'
  if (minutes >= 10) return 'warning'
  return 'fresh'
}

function formatTableTime(createdAt?: string): string {
  if (!createdAt) return ''
  try {
    const d = new Date(createdAt)
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return ''
  }
}

function getElapsedMinutes(createdAt?: string): number {
  if (!createdAt) return 0
  const ms = Date.now() - new Date(createdAt).getTime()
  return Math.max(0, Math.floor(ms / 60000))
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
}: TableFloorViewProps) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const tableStyles = useMemo(() => {
    return layout.map((item) => ({
      id: item.id,
      name: String(item.name ?? '').trim() || item.id,
      leftPct: (item.x / FLOOR_W) * 100,
      topPct: (item.y / FLOOR_H) * 100,
      widthPct: (item.w / FLOOR_W) * 100,
      heightPct: (item.h / FLOOR_H) * 100,
      rotation: item.rotation ?? 0,
      shape: String(item.shape ?? 'rect'),
      seats: Number(item.seats ?? 0) || 0,
    }))
  }, [layout])

  return (
    <div
      className={cn(
        'relative w-full rounded-xl border-2 border-slate-200 bg-slate-100 overflow-hidden',
        className
      )}
      style={{ aspectRatio: `${FLOOR_W} / ${FLOOR_H}` }}
    >
      {/* 그리드 배경 (관리자와 유사) */}
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, #94a3b8 1px, transparent 1px),
            linear-gradient(to bottom, #94a3b8 1px, transparent 1px)
          `,
          backgroundSize: `${100 / 30}% ${100 / 20}%`,
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
        const stage = status === 'preparing' ? getPreparingStage(createdAt) : null
        const elapsedMin = getElapsedMinutes(createdAt)
        const elapsedClass =
          stage === 'urgent'
            ? 'bg-red-900/80 text-red-100'
            : stage === 'warning'
              ? 'bg-amber-900/80 text-amber-100'
              : status === 'completed'
                ? 'bg-slate-800/80 text-slate-100'
                : 'bg-lime-900/80 text-lime-100'
        const isOccupied = status !== null

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTableSelect?.(tab.id)}
            className={cn(
              'absolute flex flex-col items-center justify-center cursor-pointer select-none transition-all rounded-xl shadow-sm border-2 border-dashed',
              isSquare && !isOccupied && 'bg-stone-500/90 border-stone-600 text-white',
              !isSquare && !isRound && !isOccupied && 'bg-[#d4a574] border-amber-800/40 text-stone-800',
              isRound && !isOccupied && 'bg-[#d4a574] border-amber-800/40 text-stone-800 rounded-full',
              status === 'preparing' && stage === 'fresh' && 'bg-lime-400/95 border-lime-600 text-lime-950 ring-2 ring-lime-600/80',
              status === 'preparing' && stage === 'warning' && 'bg-amber-500/90 border-amber-600 text-amber-950 ring-2 ring-amber-600/80',
              status === 'preparing' && stage === 'urgent' && 'bg-red-500/90 border-red-600 text-red-950 ring-2 ring-red-600/80',
              status === 'completed' && 'bg-slate-500/90 border-slate-600 text-slate-100 ring-2 ring-slate-600/80',
              selectedTableId === tab.id &&
                'ring-2 ring-emerald-500 ring-offset-2 border-solid border-emerald-600 z-10',
              'hover:shadow-md active:scale-[0.98]'
            )}
            style={{
              left: `${tab.leftPct}%`,
              top: `${tab.topPct}%`,
              width: `${tab.widthPct}%`,
              height: `${tab.heightPct}%`,
              transform: `rotate(${tab.rotation}deg)`,
              transformOrigin: 'center center',
              boxShadow: !isSquare ? 'inset 0 1px 2px rgba(255,255,255,0.3)' : undefined,
            }}
          >
            <span className="text-xs font-bold relative z-10 truncate max-w-full px-0.5">
              {tab.name}
            </span>
            {tab.seats > 0 && !isOccupied && (
              <span className="text-[10px] opacity-90 mt-0.5">{tab.seats}인</span>
            )}
            {status === 'preparing' && (
              <>
                <span className="text-[10px] font-semibold mt-0.5">{t('posTableStatusPreparing') || '조리중'}</span>
                {createdAt && (
                  <>
                    <span
                      className={cn(
                        'text-[12px] font-bold mt-0.5 px-1.5 py-0.5 rounded-md tabular-nums leading-none',
                        elapsedClass
                      )}
                    >
                      {elapsedMin}분
                    </span>
                    <span className="text-[9px] opacity-90 mt-0.5 tabular-nums">{formatTableTime(createdAt)}</span>
                  </>
                )}
              </>
            )}
            {status === 'completed' && (
              <>
                <span className="text-[10px] font-semibold mt-0.5">{t('posTableStatusServed') || '서빙 완료'}</span>
                {createdAt && (
                  <>
                    <span
                      className={cn(
                        'text-[12px] font-bold mt-0.5 px-1.5 py-0.5 rounded-md tabular-nums leading-none',
                        elapsedClass
                      )}
                    >
                      {elapsedMin}분
                    </span>
                    <span className="text-[9px] opacity-90 mt-0.5 tabular-nums">{formatTableTime(createdAt)}</span>
                  </>
                )}
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
