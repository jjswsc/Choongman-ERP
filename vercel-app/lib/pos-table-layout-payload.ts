/**
 * pos_table_layouts.layout_json 파싱/직렬화.
 * - 레거시: 테이블 배열만 저장
 * - v1: { v: 1, tables, floorLabels } — 매장별 구역(층) 표시명
 */

import type { PosTableFloor } from '@/lib/pos-table-floor-match'
import { clampPosTableFloor } from '@/lib/pos-table-floor-match'

export type PosFloorLabels = Partial<Record<PosTableFloor, string>>

/** 빈 테이블 기본 면 색 (편집기·홀 화면 공통) */
export const POS_TABLE_EMPTY_COLOR_RECT = '#d4a574'
export const POS_TABLE_EMPTY_COLOR_SQUARE = '#78716c'

/** 관리자 Table Layout 색상 프리셋 */
export const POS_TABLE_LAYOUT_COLOR_PRESETS = [
  POS_TABLE_EMPTY_COLOR_RECT,
  POS_TABLE_EMPTY_COLOR_SQUARE,
  '#64748b',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#0891b2',
] as const

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** `#rgb` / `#rrggbb`만 허용. 없으면 undefined(기본 모양색) */
export function normalizePosTableColor(raw: unknown): string | undefined {
  const s = String(raw ?? '').trim()
  if (!HEX_COLOR_RE.test(s)) return undefined
  if (s.length === 4) {
    const r = s[1]
    const g = s[2]
    const b = s[3]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return s.toLowerCase()
}

export function defaultPosTableEmptyColor(shape?: string): string {
  return String(shape ?? '') === 'square' ? POS_TABLE_EMPTY_COLOR_SQUARE : POS_TABLE_EMPTY_COLOR_RECT
}

/** 상대 휘도 0~1 (간단 sRGB) */
export function posTableColorLuminance(hex: string): number {
  const n = normalizePosTableColor(hex)
  if (!n) return 0.5
  const r = parseInt(n.slice(1, 3), 16) / 255
  const g = parseInt(n.slice(3, 5), 16) / 255
  const b = parseInt(n.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function posTableColorIsDark(hex: string): boolean {
  return posTableColorLuminance(hex) < 0.55
}

export function darkenPosTableColor(hex: string, amount = 0.18): string {
  const n = normalizePosTableColor(hex) ?? defaultPosTableEmptyColor()
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))))
  const r = adj(parseInt(n.slice(1, 3), 16))
  const g = adj(parseInt(n.slice(3, 5), 16))
  const b = adj(parseInt(n.slice(5, 7), 16))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** 빈 테이블 표시용: 커스텀 색 있으면 사용, 없으면 모양 기본색 */
export function resolvePosTableEmptyColor(color: unknown, shape?: string): string {
  return normalizePosTableColor(color) ?? defaultPosTableEmptyColor(shape)
}

export type PosTableLayoutTableRow = {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  floor?: number
  shape?: string
  seats?: number
  rotation?: number
  /** 빈 테이블 면 색 `#rrggbb`. 없으면 모양별 기본색 */
  color?: string
}

export type PosTableLayoutParsed = {
  tables: PosTableLayoutTableRow[]
  floorLabels: PosFloorLabels
}

const FLOOR_LABEL_MAX_LEN = 24

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function normalizePosFloorLabel(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FLOOR_LABEL_MAX_LEN)
}

/** 빈 문자열·숫자만 있는 키는 제외한 구역명 맵 */
export function normalizePosFloorLabels(raw: unknown): PosFloorLabels {
  const src = asRecord(raw) ?? {}
  const out: PosFloorLabels = {}
  for (const n of [1, 2, 3] as const) {
    const label = normalizePosFloorLabel(src[String(n)] ?? src[n as unknown as string])
    if (label) out[n] = label
  }
  return out
}

export function resolvePosFloorDisplayLabel(
  floor: number,
  floorLabels: PosFloorLabels | undefined | null,
  fallbackTemplate: string
): string {
  const f = clampPosTableFloor(Number(floor) || 1)
  const custom = normalizePosFloorLabel(floorLabels?.[f])
  if (custom) return custom
  return (fallbackTemplate || 'Floor {n}').replaceAll('{n}', String(f))
}

function mapTableRow(t: Record<string, unknown>): PosTableLayoutTableRow | null {
  const id = String(t.id ?? '').trim()
  if (!id) return null
  const color = normalizePosTableColor(t.color)
  return {
    id,
    name: String(t.name ?? ''),
    x: Number(t.x) || 0,
    y: Number(t.y) || 0,
    w: Number(t.w) || 80,
    h: Number(t.h) || 60,
    floor: clampPosTableFloor(Number(t.floor ?? 1) || 1),
    shape: String(t.shape ?? 'rect'),
    seats: Number(t.seats ?? 0) || 0,
    rotation: Number(t.rotation ?? 0) || 0,
    ...(color ? { color } : {}),
  }
}

function parseTablesArray(arr: unknown[]): PosTableLayoutTableRow[] {
  return arr
    .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object' && t !== null))
    .map(mapTableRow)
    .filter((t): t is PosTableLayoutTableRow => t != null)
}

/** DB layout_json → 테이블 + 구역명 (레거시 배열 호환) */
export function parsePosTableLayoutJson(raw: unknown): PosTableLayoutParsed {
  if (Array.isArray(raw)) {
    return { tables: parseTablesArray(raw), floorLabels: {} }
  }
  const obj = asRecord(raw)
  if (!obj) return { tables: [], floorLabels: {} }

  if (Array.isArray(obj.tables)) {
    return {
      tables: parseTablesArray(obj.tables),
      floorLabels: normalizePosFloorLabels(obj.floorLabels),
    }
  }

  // 단일 테이블 객체처럼 보이면 무시 (비정상 데이터)
  if (obj.id != null && obj.x != null) {
    const one = mapTableRow(obj)
    return { tables: one ? [one] : [], floorLabels: normalizePosFloorLabels(obj.floorLabels) }
  }

  return { tables: [], floorLabels: normalizePosFloorLabels(obj.floorLabels) }
}

/** 저장용 layout_json. 구역명이 있으면 wrapper, 없으면 레거시 배열 유지 가능 */
export function serializePosTableLayoutJson(
  tables: PosTableLayoutTableRow[],
  floorLabels?: PosFloorLabels | null
): PosTableLayoutTableRow[] | { v: 1; tables: PosTableLayoutTableRow[]; floorLabels: PosFloorLabels } {
  const labels = normalizePosFloorLabels(floorLabels ?? {})
  const rows = tables.map((t) => {
    const color = normalizePosTableColor(t.color)
    return {
      id: String(t.id ?? ''),
      name: String(t.name ?? ''),
      x: Number(t.x) || 0,
      y: Number(t.y) || 0,
      w: Number(t.w) || 80,
      h: Number(t.h) || 60,
      floor: clampPosTableFloor(Number(t.floor ?? 1) || 1),
      shape: String(t.shape ?? 'rect'),
      seats: Number(t.seats ?? 0) || 0,
      rotation: Number(t.rotation ?? 0) || 0,
      ...(color ? { color } : {}),
    }
  })
  if (Object.keys(labels).length === 0) return rows
  return { v: 1, tables: rows, floorLabels: labels }
}
