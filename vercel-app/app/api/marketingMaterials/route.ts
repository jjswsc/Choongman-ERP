import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return Number.isNaN(n) ? 0 : n
}

function parseBranchesJson(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String)
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val) as unknown
      if (Array.isArray(p)) return p.map(String)
    } catch {/* ignore */}
  }
  return []
}

/** 판촉물 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    const rows = campaignId
      ? ((await supabaseSelectFilter(
          'marketing_materials',
          `campaign_id=eq.${encodeURIComponent(campaignId)}`,
          { order: 'id.asc', limit: 500 }
        )) as Record<string, unknown>[])
      : ((await supabaseSelect('marketing_materials', {
          order: 'id.desc',
          limit: 500,
        })) as Record<string, unknown>[])

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      type: String(row.type ?? 'tentcard'),
      name: String(row.name ?? ''),
      quantity: Number(row.quantity) || 1,
      unitCost: parseNum(row.unit_cost),
      branches: parseBranchesJson(row.branches),
      status: String(row.status ?? 'planning'),
      note: String(row.note ?? ''),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingMaterials GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 판촉물 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      id?: string
      campaignId: string
      type?: string
      name?: string
      quantity?: number
      unitCost?: number
      branches?: string[]
      status?: string
      note?: string
    }

    const campaignId = String(body.campaignId ?? '').trim()
    const name = String(body.name ?? '').trim()
    const editingId = body.id?.trim()

    if (!campaignId || !name) {
      return NextResponse.json(
        { success: false, message: '캠페인 ID와 이름이 필요합니다.' },
        { headers }
      )
    }

    const row: Record<string, unknown> = {
      campaign_id: Number(campaignId),
      type: String(body.type ?? 'tentcard').trim(),
      name,
      quantity: Math.max(1, Number(body.quantity) || 1),
      unit_cost: parseNum(body.unitCost),
      branches: Array.isArray(body.branches) ? body.branches : [],
      status: String(body.status ?? 'planning').trim(),
      note: String(body.note ?? '').trim(),
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_materials',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_materials', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const inserted = (await supabaseInsert('marketing_materials', row)) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    return NextResponse.json(
      { success: true, message: '저장되었습니다.', id: created?.id ? String(created.id) : null },
      { headers }
    )
  } catch (e) {
    console.error('marketingMaterials POST:', e)
    const msg = e instanceof Error ? e.message : '저장 실패'
    return NextResponse.json({ success: false, message: msg }, { headers })
  }
}
