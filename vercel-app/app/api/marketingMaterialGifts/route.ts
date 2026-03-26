import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return Number.isNaN(n) ? 0 : n
}

/** 사은품 배정/배포 목록 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()
    const materialId = searchParams.get('materialId')?.trim()

    let rows: Record<string, unknown>[] | null = null
    if (materialId) {
      rows = (await supabaseSelectFilter(
        'marketing_material_gifts',
        `material_id=eq.${encodeURIComponent(materialId)}`,
        { order: 'id.asc', limit: 5000 }
      )) as Record<string, unknown>[] | null
    } else if (campaignId) {
      rows = (await supabaseSelectFilter(
        'marketing_material_gifts',
        `campaign_id=eq.${encodeURIComponent(campaignId)}`,
        { order: 'id.asc', limit: 5000 }
      )) as Record<string, unknown>[] | null
    } else {
      rows = (await supabaseSelect('marketing_material_gifts', {
        order: 'id.desc',
        limit: 5000,
      })) as Record<string, unknown>[] | null
    }

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      materialId: String(row.material_id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      storeName: String(row.store_name ?? ''),
      giftName: String(row.gift_name ?? ''),
      allocatedQty: parseNum(row.allocated_qty),
      distributedQty: parseNum(row.distributed_qty),
      remainingQty: parseNum(row.remaining_qty),
      ruleNote: String(row.rule_note ?? ''),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingMaterialGifts GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 사은품 배정/배포 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      id?: string
      materialId?: string
      campaignId?: string | null
      storeName?: string
      giftName?: string
      allocatedQty?: number
      distributedQty?: number
      remainingQty?: number
      ruleNote?: string
    }

    const materialId = String(body.materialId ?? '').trim()
    const storeName = String(body.storeName ?? '').trim()
    const giftName = String(body.giftName ?? '').trim()
    const campaignIdRaw = String(body.campaignId ?? '').trim()
    const campaignId = campaignIdRaw ? Number(campaignIdRaw) : null
    const allocatedQty = Math.max(0, Math.floor(parseNum(body.allocatedQty)))
    const distributedQty = Math.max(0, Math.floor(parseNum(body.distributedQty)))
    const remainingQtyInput = Math.floor(parseNum(body.remainingQty))
    const remainingQty =
      body.remainingQty == null ? Math.max(allocatedQty - distributedQty, 0) : Math.max(remainingQtyInput, 0)
    const editingId = String(body.id ?? '').trim()

    if (!materialId || !storeName || !giftName) {
      return NextResponse.json(
        { success: false, message: '홍보물/매장/사은품 정보가 필요합니다.' },
        { headers }
      )
    }
    if (distributedQty > allocatedQty) {
      return NextResponse.json(
        { success: false, message: '배포수량은 배정수량을 초과할 수 없습니다.' },
        { headers }
      )
    }

    const row: Record<string, unknown> = {
      material_id: Number(materialId),
      campaign_id: campaignId,
      store_name: storeName,
      gift_name: giftName,
      allocated_qty: allocatedQty,
      distributed_qty: distributedQty,
      remaining_qty: remainingQty,
      rule_note: String(body.ruleNote ?? '').trim(),
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_material_gifts',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_material_gifts', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const inserted = (await supabaseInsert('marketing_material_gifts', row)) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    return NextResponse.json(
      { success: true, message: '저장되었습니다.', id: created?.id ? String(created.id) : null },
      { headers }
    )
  } catch (e) {
    console.error('marketingMaterialGifts POST:', e)
    const msg = e instanceof Error ? e.message : '저장 실패'
    return NextResponse.json({ success: false, message: msg }, { headers })
  }
}
