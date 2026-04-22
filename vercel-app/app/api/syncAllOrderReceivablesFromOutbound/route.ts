import { NextRequest, NextResponse } from 'next/server'
import { reconcileOrderReceivablesOutboundBatch } from '@/lib/bulk-reconcile-order-receivables-outbound'
import { canBulkReconcileOrderReceivables } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers })

  try {
    const authResult = await requireAuth(request, 'any')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const body = await request.json()
    const userRole = String(authResult.auth.role || '')

    if (!canBulkReconcileOrderReceivables(userRole)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const lastReceivableId = Number(body.lastReceivableId ?? body.cursor ?? 0) || 0
    const batchSize = Number(body.batchSize ?? 120) || 120
    const storeFilter = body.storeFilter != null ? String(body.storeFilter).trim() : ''

    const result = await reconcileOrderReceivablesOutboundBatch({
      lastReceivableId,
      batchSize,
      storeFilter: storeFilter || undefined,
    })

    return NextResponse.json(
      {
        success: true,
        nextReceivableId: result.nextReceivableId,
        hasMore: result.hasMore,
        stats: result.stats,
        errorSamples: result.errorSamples,
      },
      { headers }
    )
  } catch (e) {
    console.error('syncAllOrderReceivablesFromOutbound:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '처리 실패' },
      { status: 500, headers }
    )
  }
}
