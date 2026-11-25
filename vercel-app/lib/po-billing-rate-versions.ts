/**
 * PO 청구 비율 버전 resolve — effective_from <= D 중 최신
 */
import type { PoBillingSettingRow } from '@/lib/po-billing'

export const PO_BILLING_RATE_BACKFILL_FROM = '2000-01-01'

export type PoBillingRateVersionRow = {
  store_name: string
  effective_from: string
  royalty_pct: number
  delivery_gp_pct: number
  grab_gp_pct: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
  created_at?: string | null
  created_by?: string | null
  id?: string
}

export function normalizeYmd(raw: string | null | undefined): string {
  const s = String(raw || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

export function clampBillingPct(n: unknown): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

export function billingPctsEqual(
  a: { royalty_pct: number; delivery_gp_pct: number; grab_gp_pct: number },
  b: { royalty_pct: number; delivery_gp_pct: number; grab_gp_pct: number }
): boolean {
  return (
    clampBillingPct(a.royalty_pct) === clampBillingPct(b.royalty_pct) &&
    clampBillingPct(a.delivery_gp_pct) === clampBillingPct(b.delivery_gp_pct) &&
    clampBillingPct(a.grab_gp_pct) === clampBillingPct(b.grab_gp_pct)
  )
}

/** versions: 동일 매장, effective_from 오름차순 권장 */
export function resolvePoBillingRateForDate(
  versions: PoBillingRateVersionRow[],
  ymd: string,
  storeName: string
): PoBillingSettingRow | null {
  const day = normalizeYmd(ymd)
  if (!day) return null
  let best: PoBillingRateVersionRow | null = null
  for (const v of versions) {
    const from = normalizeYmd(v.effective_from)
    if (!from || from > day) continue
    if (!best || from >= normalizeYmd(best.effective_from)) best = v
  }
  if (!best) return null
  return {
    store_name: storeName,
    royalty_pct: clampBillingPct(best.royalty_pct),
    delivery_gp_pct: clampBillingPct(best.delivery_gp_pct),
    grab_gp_pct: clampBillingPct(best.grab_gp_pct),
    label_royalty: best.label_royalty ?? null,
    label_delivery_gp: best.label_delivery_gp ?? null,
    label_grab_gp: best.label_grab_gp ?? null,
  }
}

/** 오늘(asOf) 기준 스냅샷에 쓸 버전 */
export function pickCurrentPoBillingVersion(
  versions: PoBillingRateVersionRow[],
  asOfYmd: string
): PoBillingRateVersionRow | null {
  const day = normalizeYmd(asOfYmd)
  if (!day) return null
  let best: PoBillingRateVersionRow | null = null
  for (const v of versions) {
    const from = normalizeYmd(v.effective_from)
    if (!from || from > day) continue
    if (!best || from >= normalizeYmd(best.effective_from)) best = v
  }
  return best
}

/** effective_from 직전 적용 비율(신규 버전 스킵 비교용). 동일 effective_from 행은 제외 */
export function predecessorPoBillingRate(
  versions: PoBillingRateVersionRow[],
  effectiveFrom: string,
  storeName: string
): PoBillingSettingRow | null {
  const from = normalizeYmd(effectiveFrom)
  if (!from) return null
  // 적용일 전날과 동일한 해석: effective_from < from 중 최신
  let best: PoBillingRateVersionRow | null = null
  for (const v of versions) {
    const vf = normalizeYmd(v.effective_from)
    if (!vf || vf >= from) continue
    if (!best || vf >= normalizeYmd(best.effective_from)) best = v
  }
  if (!best) return null
  return resolvePoBillingRateForDate([best], best.effective_from, storeName)
}

export function parsePoBillingRateVersionRows(raw: unknown[]): PoBillingRateVersionRow[] {
  const out: PoBillingRateVersionRow[] = []
  for (const r of raw || []) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const store_name = String(o.store_name || '').trim()
    const effective_from = normalizeYmd(String(o.effective_from || ''))
    if (!store_name || !effective_from) continue
    out.push({
      id: o.id != null ? String(o.id) : undefined,
      store_name,
      effective_from,
      royalty_pct: clampBillingPct(o.royalty_pct),
      delivery_gp_pct: clampBillingPct(o.delivery_gp_pct),
      grab_gp_pct: clampBillingPct(o.grab_gp_pct),
      label_royalty: o.label_royalty != null ? String(o.label_royalty) : null,
      label_delivery_gp: o.label_delivery_gp != null ? String(o.label_delivery_gp) : null,
      label_grab_gp: o.label_grab_gp != null ? String(o.label_grab_gp) : null,
      created_at: o.created_at != null ? String(o.created_at) : null,
      created_by: o.created_by != null ? String(o.created_by) : null,
    })
  }
  out.sort((a, b) => {
    const c = a.store_name.localeCompare(b.store_name)
    if (c !== 0) return c
    return a.effective_from.localeCompare(b.effective_from)
  })
  return out
}
