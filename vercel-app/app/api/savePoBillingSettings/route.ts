import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

type RowIn = {
  store_name?: string
  royalty_pct?: number
  delivery_gp_pct?: number
  grab_gp_pct?: number
  label_royalty?: string | null
  label_delivery_gp?: string | null
  label_grab_gp?: string | null
}

function clampPct(n: unknown): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = await request.json()
    const list = Array.isArray(body?.rows) ? (body.rows as RowIn[]) : []
    if (list.length === 0) {
      return NextResponse.json({ success: false, message: 'rows 배열이 필요합니다.' }, { status: 400, headers })
    }
    const now = new Date().toISOString()
    const rows: Record<string, unknown>[] = []
    for (const r of list) {
      const store_name = String(r.store_name || '').trim()
      if (!store_name) continue
      rows.push({
        store_name,
        royalty_pct: clampPct(r.royalty_pct),
        delivery_gp_pct: clampPct(r.delivery_gp_pct),
        grab_gp_pct: clampPct(r.grab_gp_pct),
        label_royalty: String(r.label_royalty ?? '').trim() || null,
        label_delivery_gp: String(r.label_delivery_gp ?? '').trim() || null,
        label_grab_gp: String(r.label_grab_gp ?? '').trim() || null,
        updated_at: now,
      })
    }
    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 매장명이 없습니다.' }, { status: 400, headers })
    }
    await supabaseUpsert('po_billing_settings', rows, 'store_name')
    return NextResponse.json({ success: true, saved: rows.length }, { headers })
  } catch (e) {
    console.error('savePoBillingSettings:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers }
    )
  }
}
