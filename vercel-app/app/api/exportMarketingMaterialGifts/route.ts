import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import type { MarketingMaterialGift } from '@/lib/api-client'
import { aggregateGiftInventoryGroups, computedGiftRemaining } from '@/lib/marketing-material-gift-inventory'

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

    const matMap = new Map<number, { name: string; campaign_id: number | null; quantity: number }>()
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
          quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)),
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
      const alloc = Math.max(0, Math.floor(Number(row.allocated_qty) || 0))
      const dist = Math.max(0, Math.floor(Number(row.distributed_qty) || 0))
      const remDb = Math.max(0, Math.floor(Number(row.remaining_qty) || 0))
      const remCalc = computedGiftRemaining(alloc, dist)
      return {
        캠페인번호: camp?.campaign_no ?? '',
        캠페인명: camp?.topic ?? '',
        홍보물ID: String(row.material_id ?? ''),
        홍보물명: mat?.name ?? '',
        매장: String(row.store_name ?? ''),
        사은품명: String(row.gift_name ?? ''),
        배정: alloc,
        배포: dist,
        잔여_계산: remCalc,
        잔여_DB: remDb,
        수량일치: remDb === remCalc ? 'O' : 'X',
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
              잔여_계산: 0,
              잔여_DB: 0,
              수량일치: '',
              기준메모: '',
              수정일: '',
            },
          ]
    )

    const giftModels: MarketingMaterialGift[] = gifts.map((row) => ({
      id: String(row.id ?? ''),
      materialId: String(row.material_id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      storeName: String(row.store_name ?? ''),
      giftName: String(row.gift_name ?? ''),
      allocatedQty: Math.max(0, Math.floor(Number(row.allocated_qty) || 0)),
      distributedQty: Math.max(0, Math.floor(Number(row.distributed_qty) || 0)),
      remainingQty: Math.max(0, Math.floor(Number(row.remaining_qty) || 0)),
      ruleNote: String(row.rule_note ?? ''),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    }))
    const materialMetaById: Record<string, { name: string; quantity: number }> = {}
    for (const [id, v] of matMap.entries()) {
      materialMetaById[String(id)] = { name: v.name, quantity: v.quantity }
    }
    const invGroups = aggregateGiftInventoryGroups(giftModels, materialMetaById)
    const summaryRows = invGroups.map((g) => ({
      홍보물명: g.materialName,
      사은품명: g.giftName,
      매장행수: g.storeRowCount,
      매장수: g.uniqueStoreCount,
      배정합: g.totalAllocated,
      배포합: g.totalDistributed,
      잔여합_계산: g.totalRemainingComputed,
      홍보물수량: g.materialQuantity || '',
      수량대비차이: g.materialQuantity > 0 ? g.poolVsAllocated : '',
      불일치행수: g.mismatchRowCount,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '사은품')
    const ws2 = XLSX.utils.json_to_sheet(
      summaryRows.length > 0
        ? summaryRows
        : [
            {
              홍보물명: '',
              사은품명: '데이터 없음',
              매장행수: 0,
              매장수: 0,
              배정합: 0,
              배포합: 0,
              잔여합_계산: 0,
              홍보물수량: '',
              수량대비차이: '',
              불일치행수: 0,
            },
          ]
    )
    XLSX.utils.book_append_sheet(wb, ws2, '재고요약')
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
