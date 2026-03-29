import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as { id: string }
    const id = String(body.id ?? '').trim()
    if (!id) return NextResponse.json({ success: false, message: 'id 필요' }, { headers })
    await supabaseDeleteByFilter('marketing_material_deployments', `id=eq.${id}`)
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('deleteMarketingMaterialDeployment:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
