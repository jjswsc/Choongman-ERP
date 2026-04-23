import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * 인사 규정 열람 확인 — hr_policy_reads (acknowledged_version = 당시 content_version)
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Cache-Control', 'no-store, max-age=0')

  try {
    const body = await request.json()
    const policyId = Number(body?.policyId ?? body?.policy_id)
    const store = String(body?.store || '').trim()
    const name = String(body?.name || '').trim()
    const action = String(body?.action || '확인').trim() || '확인'

    if (isNaN(policyId) || policyId <= 0 || !store || !name) {
      return NextResponse.json({ success: false, message: '잘못된 요청입니다.' }, { status: 400, headers })
    }

    if (action === '확인') {
      const rows = (await supabaseSelectFilter('hr_policies', `id=eq.${policyId}`, {
        limit: 1,
        select: 'id,content_version,is_active',
      })) as { id?: number; content_version?: number; is_active?: boolean }[]
      const pol = rows?.[0]
      if (!pol || pol.is_active === false) {
        return NextResponse.json({ success: false, message: '규정을 찾을 수 없습니다.' }, { status: 404, headers })
      }
      const cv = Math.max(1, Math.floor(Number(pol.content_version ?? 1)) || 1)
      await supabaseUpsert(
        'hr_policy_reads',
        [
          {
            policy_id: policyId,
            store,
            name,
            read_at: new Date().toISOString(),
            status: '확인',
            acknowledged_version: cv,
          },
        ],
        'policy_id,store,name'
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: action === '확인' ? '확인되었습니다.' : '나중에 다시 확인해 주세요.',
      },
      { headers }
    )
  } catch (e) {
    console.error('confirmHrPolicyRead:', e)
    return NextResponse.json({ success: false, message: '처리 실패' }, { status: 500, headers })
  }
}
