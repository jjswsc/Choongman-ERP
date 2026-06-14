/** POS 조리 경과 단계 — Tailwind class만 (판정·API 로직과 분리) */
export type PosCookStage = 'fresh' | 'warning' | 'urgent'

/** 배달/포장·테이블 목록 패널 외곽 */
export const POS_PANEL_SHELL_CLASS = 'rounded-xl border-2 border-slate-200 bg-slate-100'

/** order-bar 카드 — preparing 단계별 */
export const posCookStageOrderBarCardClass: Record<PosCookStage, string> = {
  fresh: 'bg-lime-400/95 border-lime-600 text-lime-950',
  warning: 'bg-amber-500/90 border-amber-600 text-amber-950',
  urgent: 'bg-red-500/90 border-red-600 text-red-950',
}

/** 테이블 면 — preparing 단계별 */
export const posCookStageTableSurfaceClass: Record<PosCookStage, string> = {
  fresh: 'bg-lime-400/95 border-lime-600 ring-2 ring-lime-600/80',
  warning: 'bg-amber-500/90 border-amber-600 ring-2 ring-amber-600/80',
  urgent: 'bg-red-500/90 border-red-600 ring-2 ring-red-600/80',
}

/** 테이블 라벨 글자 — preparing 단계별 */
export const posCookStageTableTextClass: Record<PosCookStage, string> = {
  fresh: 'text-lime-950',
  warning: 'text-amber-950',
  urgent: 'text-red-950',
}

/** order-bar 상태 pill — preparing 단계별 */
export const posCookStagePillClass: Record<PosCookStage, string> = {
  fresh: 'bg-lime-500 text-white ring-1 ring-lime-600/30',
  warning: 'bg-amber-500 text-white ring-1 ring-amber-600/30',
  urgent: 'bg-red-500 text-white ring-1 ring-red-600/30',
}

/** 테이블 경과 분 badge — preparing 단계별 */
export const posCookStageElapsedBadgeClass: Record<PosCookStage, string> = {
  fresh: 'border-lime-300/90 bg-lime-950/88 text-lime-50 ring-1 ring-lime-400/35',
  warning: 'border-amber-300/90 bg-amber-950/88 text-amber-50 ring-1 ring-amber-400/35',
  urgent: 'border-red-300/90 bg-red-950/88 text-red-50 ring-1 ring-red-400/40',
}

/** 테이블 상태 pill — preparing 단계별 */
export const posCookStageStatusBadgeClass: Record<PosCookStage, string> = {
  fresh: 'border-lime-300/95 bg-lime-950/90 text-lime-50 ring-1 ring-lime-400/40',
  warning: 'border-amber-300/95 bg-amber-950/90 text-amber-50 ring-1 ring-amber-400/40',
  urgent: 'border-red-300/95 bg-red-950/90 text-red-50 ring-1 ring-red-400/45',
}

export function posCookStageOrderBarCard(stage: PosCookStage): string {
  return posCookStageOrderBarCardClass[stage]
}

export function posCookStageTableSurface(stage: PosCookStage): string {
  return posCookStageTableSurfaceClass[stage]
}
