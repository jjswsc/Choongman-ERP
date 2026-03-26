import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    const giftRows = campaignId
      ? ((await supabaseSelectFilter(
          'marketing_material_gifts',
          `campaign_id=eq.${encodeURIComponent(campaignId)}`,
          { order: 'id.asc', limit: 10000 }
        )) as Record<string, unknown>[] | null)
      : ((await supabaseSelect('marketing_material_gifts', {
          order: 'id.desc',
          limit: 10000,
        })) as Record<string, unknown>[] | null)

    const gifts = giftRows || []
    const materialIds = [
      ...new Set(
        gifts
          .map((r) => Number(r.material_id))
          .filter((n) => Number.isFinite(n) && n > 0)
      ),
    ]

    const matMap = new Map<number, { name: string; campaign_id: number | null }>()
    for (const batch of chunk(materialIds, 80)) {
      const filter = `id=in.(${batch.join(',')})`
      const mats = (await supabaseSelectFilter('marketing_materials', filter, {
        limit: 500,
      })) as Record<string, unknown>[] | null
      for (const row of mats || []) {
        const id = Number(row.id)
        if (!Number.isFinite(id)) continue
        matMap.set(id, {
          name: String(row.name ?? ''),
          campaign_id: row.campaign_id != null ? Number(row.campaign_id) : null,
        })
      }
    }

    const campaignIds = [
      ...new Set(
        [
          ...gifts.map((r) => (r.campaign_id != null ? Number(r.campaign_id) : null)),
          ...[...matMap.values()].map((m) => m.campaign_id),
        ].filter((x): x is number => x != null && Number.isFinite(x))
      ),
    ]

    const campMap = new Map<number, { topic: string; campaign_no: string }>()
    for (const batch of chunk(campaignIds, 80)) {
      const filter = `id=in.(${batch.join(',')})`
      const camps = (await supabaseSelectFilter('marketing_campaigns', filter, {
        limit: 500,
      })) as Record<string, unknown>[] | null
      for (const row of camps || []) {
        const id = Number(row.id)
        if (!Number.isFinite(id)) continue
        campMap.set(id, {
          topic: String(row.topic ?? ''),
          campaign_no: String(row.campaign_no ?? ''),
        })
      }
    }

    const sheetRows = gifts.map((row) => {
      const mid = Number(row.material_id)
      const mat = Number.isFinite(mid) ? matMap.get(mid) : undefined
      const cid =
        row.campaign_id != null
          ? Number(row.campaign_id)
          : mat?.campaign_id ?? null
      const camp = cid != null && Number.isFinite(cid) ? campMap.get(cid) : undefined
      return {
        캠페인번호: camp?.campaign_no ?? '',
        캠페인명: camp?.topic ?? '',
        홍보물ID: String(row.material_id ?? ''),
        홍보물명: mat?.name ?? '',
        매장: String(row.store_name ?? ''),
        사은품명: String(row.gift_name ?? ''),
        배정: Number(row.allocated_qty) || 0,
        배포: Number(row.distributed_qty) || 0,
        잔여: Number(row.remaining_qty) || 0,
        기준메모: String(row.rule_note ?? ''),
        수정일: row.updated_at ? String(row.updated_at) : '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(
      sheetRows.length > 0
        ? sheetRows
        : [
            {
              캠페인번호: '',
              캠페인명: '데이터 없음',
              홍보물ID: '',
              홍보물명: '',
              매장: '',
              사은품명: '',
              배정: 0,
              배포: 0,
              잔여: 0,
              기준메모: '',
              수정일: '',
            },
          ]
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '사은품')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const fname = campaignId
      ? `marketing-material-gifts-campaign-${campaignId}.xlsx`
      : 'marketing-material-gifts.xlsx'

    headers.set(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fname)}"`)

    return new NextResponse(new Uint8Array(buf), { headers })
  } catch (e) {
    console.error('exportMarketingMaterialGifts:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'export failed' },
      { status: 500, headers }
    )
  }
}
