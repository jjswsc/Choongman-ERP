import { NextRequest, NextResponse } from 'next/server'
import { ensureQrTokensForTables, listQrTokensForStore } from '@/lib/qr-table-server'
import { enqueueTableQrPrintJob } from '@/lib/pos-print-job-queue'
import { requirePosStoreWriteAuth, posApiCorsHeaders, applyPosApiCors } from '@/lib/pos-api-write-auth'
import {
  QR_TABLE_THERMAL_SCAN_EN,
  QR_TABLE_THERMAL_SCAN_TH,
} from '@/lib/qr-table-thermal-slip-html'

function requestOrigin(req: NextRequest): string {
  const fromHeader = String(req.headers.get('origin') || '').trim().replace(/\/$/, '')
  if (fromHeader) return fromHeader
  const proto = String(req.headers.get('x-forwarded-proto') || 'https').split(',')[0]?.trim() || 'https'
  const host = String(req.headers.get('x-forwarded-host') || req.headers.get('host') || '')
    .split(',')[0]
    ?.trim()
  if (host) return `${proto}://${host}`.replace(/\/$/, '')
  return String(process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/^(?!https?:\/\/)/, 'https://')
}

export async function OPTIONS() {
  return applyPosApiCors(new NextResponse(null, { status: 204, headers: posApiCorsHeaders() }))
}

/** 오더 태블릿·휴대폰: 메인 POS 영수증 프린터로 테이블 QR 인쇄 요청 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  try {
    const body = (await req.json()) as Record<string, unknown>
    const storeCode = String(body.storeCode || '').trim()
    const tableName = String(body.tableName || '').trim()
    const auth = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!auth.ok) return auth.response
    if (!tableName) {
      return applyPosApiCors(
        NextResponse.json({ success: false, message: 'table_required' }, { status: 400, headers })
      )
    }

    const origin = requestOrigin(req)
    let tokens = await listQrTokensForStore(storeCode, origin)
    let token = tokens.find((t) => String(t.tableName || '').trim() === tableName)
    if (!token?.token) {
      tokens = await ensureQrTokensForTables({ storeCode, tableNames: [tableName], origin })
      token = tokens.find((t) => String(t.tableName || '').trim() === tableName)
    }
    if (!token?.token) {
      return applyPosApiCors(
        NextResponse.json({ success: false, message: 'qr_print_no_token' }, { status: 400, headers })
      )
    }

    const publicUrl = String(token.publicUrl || '').trim()
    const url = publicUrl || (origin ? `${origin}/t/${token.token}` : '')
    if (!url) {
      return applyPosApiCors(
        NextResponse.json({ success: false, message: 'qr_url_required' }, { status: 400, headers })
      )
    }

    await enqueueTableQrPrintJob({
      storeCode,
      tableName,
      url,
      storeLabel: String(body.storeLabel || '').trim() || storeCode,
      scanTh: String(body.scanTh || '').trim() || QR_TABLE_THERMAL_SCAN_TH,
      scanEn: String(body.scanEn || '').trim() || QR_TABLE_THERMAL_SCAN_EN,
    })

    return applyPosApiCors(NextResponse.json({ success: true, queued: true }, { headers }))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return applyPosApiCors(NextResponse.json({ success: false, message: msg }, { status: 400, headers }))
  }
}
