import { appendPosInternalMemoStamp } from '@/lib/pos-tax-invoice'

/** 합석(merge)으로 흡수(absorb)된 주문 — memo 내부 스탬프 */
export const POS_ORDER_MERGED_STAMP_LINE_RE =
  /^\[ORDER_MERGED\s+[^\]]+\bkeep_id=(\d+)(?:\s+keep_no=([^\]]+))?\]/

/**
 * 합석으로 품목을 받은 keep 주문 — Realtime/폴링이 추가주문 자동인쇄로 오인하지 않도록.
 * (문서: 합석 시 자동 주방/영수증 재출력 안 함)
 */
export const POS_ORDER_MERGE_KEEP_STAMP_LINE_RE =
  /^\[ORDER_MERGE_KEEP\s+(\S+)\s+absorb_id=(\d+)\]/

/** 합석 시 absorb 줄을 keep items_json에 넣을 때 쓰는 id 접두 (`m{absorbOrderId}-…`) */
export const POS_MERGE_ABSORBED_LINE_ID_RE = /^m(\d+)-/

export function buildPosOrderMergedAbsorbStamp(params: {
  keepOrderId: number
  keepOrderNo?: string | null
}): string {
  const keepId = Math.floor(Number(params.keepOrderId))
  const keepNo = String(params.keepOrderNo ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  const ts = new Date().toISOString()
  return keepNo
    ? `[ORDER_MERGED ${ts} keep_id=${keepId} keep_no=${keepNo}]`
    : `[ORDER_MERGED ${ts} keep_id=${keepId}]`
}

export function appendPosOrderMergedAbsorbStamp(
  memo: string | undefined | null,
  params: { keepOrderId: number; keepOrderNo?: string | null }
): string {
  return appendPosInternalMemoStamp(memo, buildPosOrderMergedAbsorbStamp(params))
}

export function isPosOrderMergedAbsorb(memo: string | undefined | null): boolean {
  const lines = String(memo ?? '').split(/\r?\n/)
  return lines.some((line) => POS_ORDER_MERGED_STAMP_LINE_RE.test(line.trim()))
}

export function parsePosOrderMergedKeepRef(memo: string | undefined | null): {
  keepOrderId: number
  keepOrderNo: string | null
} | null {
  const lines = String(memo ?? '').split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = POS_ORDER_MERGED_STAMP_LINE_RE.exec(lines[i].trim())
    if (!m) continue
    const keepOrderId = Math.floor(Number(m[1]))
    if (!Number.isFinite(keepOrderId) || keepOrderId <= 0) return null
    const keepOrderNo = String(m[2] ?? '').trim() || null
    return { keepOrderId, keepOrderNo }
  }
  return null
}

export function buildPosOrderMergedKeepStamp(params: { absorbOrderId: number }): string {
  const absorbId = Math.floor(Number(params.absorbOrderId))
  const ts = new Date().toISOString()
  return `[ORDER_MERGE_KEEP ${ts} absorb_id=${absorbId}]`
}

export function appendPosOrderMergedKeepStamp(
  memo: string | undefined | null,
  params: { absorbOrderId: number }
): string {
  return appendPosInternalMemoStamp(memo, buildPosOrderMergedKeepStamp(params))
}

export function isPosOrderMergedKeepReceive(memo: string | undefined | null): boolean {
  const lines = String(memo ?? '').split(/\r?\n/)
  return lines.some((line) => POS_ORDER_MERGE_KEEP_STAMP_LINE_RE.test(line.trim()))
}

export function parseLatestPosOrderMergeKeepStamp(memo: string | undefined | null): {
  atMs: number
  absorbOrderId: number
} | null {
  const lines = String(memo ?? '').split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const m = POS_ORDER_MERGE_KEEP_STAMP_LINE_RE.exec(lines[i].trim())
    if (!m) continue
    const atMs = Date.parse(m[1])
    const absorbOrderId = Math.floor(Number(m[2]))
    if (!Number.isFinite(atMs) || !Number.isFinite(absorbOrderId) || absorbOrderId <= 0) continue
    return { atMs, absorbOrderId }
  }
  return null
}

/** 합석 keep 스탬프가 withinMs 이내이면 true (폴링·Realtime 추가주문 오인 방지) */
export function isRecentPosOrderMergeKeepReceive(
  memo: string | undefined | null,
  withinMs = 45_000,
  nowMs = Date.now()
): boolean {
  const parsed = parseLatestPosOrderMergeKeepStamp(memo)
  if (!parsed) return false
  return nowMs - parsed.atMs >= 0 && nowMs - parsed.atMs <= withinMs
}

export function isPosMergeAbsorbedLineId(id: string | undefined | null): boolean {
  return POS_MERGE_ABSORBED_LINE_ID_RE.test(String(id ?? '').trim())
}

export function isPosOrderMergedAbsorbRow(row: {
  status?: string | null
  memo?: string | null
}): boolean {
  return String(row.status ?? '').trim().toLowerCase() === 'cancelled' && isPosOrderMergedAbsorb(row.memo)
}

/** 취소·환불 통계에 포함할 실제 취소 주문(합석 흡수 제외) */
export function isPosOrderStatsCancellation(row: {
  status?: string | null
  memo?: string | null
}): boolean {
  const st = String(row.status ?? '').trim().toLowerCase()
  if (st === 'refunded') return true
  if (st !== 'cancelled' && st !== 'canceled') return false
  return !isPosOrderMergedAbsorb(row.memo)
}
