import { appendPosInternalMemoStamp } from '@/lib/pos-tax-invoice'

/** 합석(merge)으로 흡수(absorb)된 주문 — memo 내부 스탬프 */
export const POS_ORDER_MERGED_STAMP_LINE_RE =
  /^\[ORDER_MERGED\s+[^\]]+\bkeep_id=(\d+)(?:\s+keep_no=([^\]]+))?\]/

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
