import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  loadEvaluationAnalytics,
  canViewEvalAnalyticsRole,
} from '@/lib/evaluation-analytics-load'
import { isFranchiseeRole, isManagerRole } from '@/lib/permissions'

/** 직원 평가 집계 (RPC 우선, 실패 시 행 집계) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const auth = await getVerifiedAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }
  const role = String(auth.role || '')
  if (!canViewEvalAnalyticsRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }

  const userStore = String(auth.store || '').trim()
  if ((isManagerRole(role) || isFranchiseeRole(role)) && !userStore) {
    return NextResponse.json({ error: 'Missing store scope' }, { status: 403, headers })
  }

  const { searchParams } = new URL(req.url)
  const startStr = (searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = (searchParams.get('end') || '').trim().slice(0, 10)
  const type = (searchParams.get('type') || 'all').trim()
  const storeQuery = (searchParams.get('store') || 'All').trim()

  if (!startStr || !endStr || startStr.length < 10 || endStr.length < 10) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400, headers })
  }

  try {
    const payload = await loadEvaluationAnalytics(auth, {
      start: startStr,
      end: endStr,
      type,
      storeQuery,
    })
    return NextResponse.json(payload, { headers })
  } catch (e) {
    console.error('getEvaluationAnalytics:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
