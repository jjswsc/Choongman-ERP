'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/** POS 테이블 패널(서빙 체크) 폭·글자 크기 — 기기(브라우저)별 저장 */
const STORAGE_KEY = 'cm_pos_checker_view_v1'
const CHANGE_EVENT = 'cm-pos-checker-view-change'

export const POS_CHECKER_WIDTHS = ['normal', 'wide', 'xwide'] as const
export type PosCheckerWidth = (typeof POS_CHECKER_WIDTHS)[number]

export const POS_CHECKER_ZOOMS = [1, 1.15, 1.3, 1.5] as const

type Prefs = { width: PosCheckerWidth; zoomIdx: number }

const DEFAULT_PREFS: Prefs = { width: 'normal', zoomIdx: 0 }

function parsePrefs(raw: string): Prefs {
  if (!raw) return DEFAULT_PREFS
  try {
    const obj = JSON.parse(raw) as Partial<Prefs>
    const width = POS_CHECKER_WIDTHS.includes(obj.width as PosCheckerWidth)
      ? (obj.width as PosCheckerWidth)
      : DEFAULT_PREFS.width
    const zoomIdx = Math.min(
      POS_CHECKER_ZOOMS.length - 1,
      Math.max(0, Math.trunc(Number(obj.zoomIdx ?? 0) || 0))
    )
    return { width, zoomIdx }
  } catch {
    return DEFAULT_PREFS
  }
}

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function writePrefs(next: Prefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* 저장 불가(시크릿 모드 등) — 이번 화면에서만 무시 */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** 데스크톱 사이드 패널 폭 (모바일 세로 배치에서는 쓰지 않음) */
export function posCheckerPanelWidthClass(width: PosCheckerWidth): string {
  if (width === 'xwide') return 'w-[34rem]'
  if (width === 'wide') return 'w-[26rem]'
  return 'w-72'
}

export function usePosCheckerViewPrefs() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '')
  const prefs = useMemo(() => parsePrefs(raw), [raw])

  const cycleWidth = useCallback(() => {
    const cur = parsePrefs(readRaw())
    const idx = POS_CHECKER_WIDTHS.indexOf(cur.width)
    writePrefs({ ...cur, width: POS_CHECKER_WIDTHS[(idx + 1) % POS_CHECKER_WIDTHS.length] })
  }, [])

  const stepZoom = useCallback((delta: 1 | -1) => {
    const cur = parsePrefs(readRaw())
    const zoomIdx = Math.min(POS_CHECKER_ZOOMS.length - 1, Math.max(0, cur.zoomIdx + delta))
    if (zoomIdx !== cur.zoomIdx) writePrefs({ ...cur, zoomIdx })
  }, [])
  const zoomIn = useCallback(() => stepZoom(1), [stepZoom])
  const zoomOut = useCallback(() => stepZoom(-1), [stepZoom])

  return {
    width: prefs.width,
    zoom: POS_CHECKER_ZOOMS[prefs.zoomIdx] ?? 1,
    canZoomIn: prefs.zoomIdx < POS_CHECKER_ZOOMS.length - 1,
    canZoomOut: prefs.zoomIdx > 0,
    zoomIn,
    zoomOut,
    cycleWidth,
  }
}
