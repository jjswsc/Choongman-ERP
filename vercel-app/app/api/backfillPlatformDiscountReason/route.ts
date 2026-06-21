/**
 * 배달앱 API 주문 — discount_reason 일괄 보정 (할인 분석「배달·플랫폼」)
 * POST { "dryRun": false, "days": 365, "limit": 5000, "storeCode": "1046" }
 * 기본 dryRun=true — 실제 반영은 dryRun:false 명시
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { resolvePlatformDiscountReasonBackfillPatch } from '@/lib/pos-platform-discount-reason'
import { supabaseSelectFilterAllPages, supabaseUpdateByFilter } from '@/lib/supabase-server'

type PosOrderBackfillRow = {
  id?: number
  store_code?: string
  order_type?: string
  delivery_app_code?: string | null
  discount_amt?: number
  coupon_discount_amt?: number
  discount_reason?: string
  items_json?: string | null
  memo?: string | null
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      const res = authResult.errorResponse
      res.headers.set('Access-Control-Allow-Origin', '*')
      return res
    }

    const body = (await request.json().catch(() => ({}))) as {
      days?: number
      limit?: number
      storeCode?: string
      dryRun?: boolean
    }
    const days = Number.isFinite(Number(body.days)) ? Math.max(1, Math.trunc(Number(body.days))) : 365
    const limit = Number.isFinite(Number(body.limit))
      ? Math.min(20_000, Math.max(1, Math.trunc(Number(body.limit))))
      : 5000
    const storeCode = String(body.storeCode ?? '').trim()
    const dryRun = body.dryRun !== false

    const sinceIso = new Date(Date.now() - days * 86400_000).toISOString()
    const filters = [
      'order_type=eq.delivery',
      `discount_amt=gt.0`,
      `created_at=gte.${encodeURIComponent(sinceIso)}`,
    ]
    if (storeCode) filters.push(`store_code=eq.${encodeURIComponent(storeCode)}`)

    const rows = (await supabaseSelectFilterAllPages('pos_orders', filters.join('&'), {
      select:
        'id,store_code,order_type,delivery_app_code,discount_amt,coupon_discount_amt,discount_reason,items_json,memo',
      pageSize: 1000,
      maxRows: limit,
    })) as PosOrderBackfillRow[] | null

    let scanned = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    const details: string[] = []

    for (const row of rows || []) {
      scanned += 1
      const id = Number(row.id ?? 0)
      if (!id) {
        skipped += 1
        continue
      }

      const nextReason = resolvePlatformDiscountReasonBackfillPatch(row)
      if (!nextReason) {
        skipped += 1
        continue
      }

      try {
        if (!dryRun) {
          await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, {
            discount_reason: nextReason,
          })
        }
        updated += 1
        if (details.length < 50) {
          details.push(
            `#${id} ${String(row.store_code ?? '')} "${String(row.discount_reason ?? '').trim() || '(empty)'}" → "${nextReason}"`
          )
        }
      } catch (e) {
        failed += 1
        if (details.length < 50) {
          details.push(`fail#${id}:${String(e instanceof Error ? e.message : e)}`)
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        dryRun,
        days,
        limit,
        scanned,
        updated,
        skipped,
        failed,
        details,
      },
      { headers }
    )
  } catch (e) {
    console.error('backfillPlatformDiscountReason:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'failed' },
      { status: 500, headers }
    )
  }
}
