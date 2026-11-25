import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateStr } from '@/lib/pos-business-day'
import {
  billingPctsEqual,
  clampBillingPct,
  normalizeYmd,
  parsePoBillingRateVersionRows,
  pickCurrentPoBillingVersion,
  predecessorPoBillingRate,
} from '@/lib/po-billing-rate-versions'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'

type RowIn = {
  store_name?: string
  royalty_pct?: number
  delivery_gp_pct?: number
  grab_gp_pct?: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const list = Array.isArray(body?.rows) ? (body.rows as RowIn[]) : []
    const effectiveFrom = normalizeYmd(String(body?.effective_from || '')) || getBangkokDateStr()
    if (list.length === 0) {
      return NextResponse.json({ success: false, message: 'rows 배열이 필요합니다.' }, { status: 400, headers })
    }

    let createdBy: string | null = null
    try {
      const auth = await getVerifiedAuth(request, { skipSaasGate: true })
      if (auth) {
        createdBy =
          String(auth.employeeCode || '').trim() ||
          String(auth.name || '').trim() ||
          null
      }
    } catch {
      createdBy = null
    }

    const now = new Date().toISOString()
    const todayBkk = getBangkokDateStr()
    const versionRows: Record<string, unknown>[] = []
    const touchedStores: string[] = []
    let skippedUnchanged = 0

    for (const r of list) {
      const store_name = String(r.store_name || '').trim()
      if (!store_name) continue

      const nextPct = {
        royalty_pct: clampBillingPct(r.royalty_pct),
        delivery_gp_pct: clampBillingPct(r.delivery_gp_pct),
        grab_gp_pct: clampBillingPct(r.grab_gp_pct),
      }
      const labels = {
        label_royalty: String(r.label_royalty ?? '').trim() || null,
        label_delivery_gp: String(r.label_delivery_gp ?? '').trim() || null,
        label_grab_gp: String(r.label_grab_gp ?? '').trim() || null,
      }

      const existingRaw = (await supabaseSelectFilter(
        'po_billing_rate_versions',
        `store_name=eq.${encodeURIComponent(store_name)}`,
        { order: 'effective_from.asc', limit: 500 }
      )) as Record<string, unknown>[]
      const existing = parsePoBillingRateVersionRows(existingRaw || [])

      const sameFrom = existing.find((v) => v.effective_from === effectiveFrom)
      if (!sameFrom) {
        const pred = predecessorPoBillingRate(existing, effectiveFrom, store_name)
        if (pred && billingPctsEqual(pred, nextPct)) {
          skippedUnchanged += 1
          continue
        }
      } else if (billingPctsEqual(sameFrom, nextPct)) {
        // 동일 적용일·동일 % → 버전·스냅샷 모두 스킵
        skippedUnchanged += 1
        continue
      }

      versionRows.push({
        store_name,
        effective_from: effectiveFrom,
        ...nextPct,
        ...labels,
        created_at: now,
        created_by: createdBy,
      })
      touchedStores.push(store_name)
    }

    if (versionRows.length > 0) {
      await supabaseUpsert('po_billing_rate_versions', versionRows, 'store_name,effective_from')
    }

    // 오늘 방콕 기준 스냅샷 동기화(소급 저장 포함)
    const snapshotRows: Record<string, unknown>[] = []
    for (const store_name of touchedStores) {
      const existingRaw = (await supabaseSelectFilter(
        'po_billing_rate_versions',
        `store_name=eq.${encodeURIComponent(store_name)}`,
        { order: 'effective_from.asc', limit: 500 }
      )) as Record<string, unknown>[]
      const versions = parsePoBillingRateVersionRows(existingRaw || [])
      const cur = pickCurrentPoBillingVersion(versions, todayBkk)
      if (!cur) continue
      snapshotRows.push({
        store_name,
        royalty_pct: cur.royalty_pct,
        delivery_gp_pct: cur.delivery_gp_pct,
        grab_gp_pct: cur.grab_gp_pct,
        label_royalty: cur.label_royalty ?? null,
        label_delivery_gp: cur.label_delivery_gp ?? null,
        label_grab_gp: cur.label_grab_gp ?? null,
        effective_from: cur.effective_from,
        updated_at: now,
      })
    }
    if (snapshotRows.length > 0) {
      await supabaseUpsert('po_billing_settings', snapshotRows, 'store_name')
    }

    return NextResponse.json(
      {
        success: true,
        saved: versionRows.length,
        skippedUnchanged,
        effective_from: effectiveFrom,
        stores: touchedStores,
      },
      { headers }
    )
  } catch (e) {
    console.error('savePoBillingSettings:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers }
    )
  }
}
