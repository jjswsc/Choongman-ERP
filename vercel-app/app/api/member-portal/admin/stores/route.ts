import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  fetchErpStoresMaster,
  invalidateErpStoresMasterCache,
  type ErpStoreMasterRow,
} from '@/lib/erp-store-master'
import {
  defaultMemberPortalMapQuery,
  mapErpStoreToMemberPortal,
  type MemberPortalStoreDto,
} from '@/lib/member-portal-stores'
import {
  supabaseSelect,
  supabaseUpdateByFilter,
  supabaseUpsertMerge,
} from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

const LEGACY_SELECT =
  'store_code,display_name,aliases,sort_order,is_active,photo_url,map_query,address'
const LEGACY_SELECT_BASIC = 'store_code,display_name,aliases,sort_order,is_active'

function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean)
  }
  const text = String(raw || '').trim()
  if (!text) return []
  return text
    .split(/[,;|]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

async function fetchAllErpStoresForAdmin(): Promise<ErpStoreMasterRow[]> {
  try {
    const rows = (await supabaseSelect('erp_stores', {
      select: LEGACY_SELECT,
      order: 'sort_order.asc,display_name.asc',
      limit: 500,
    })) as ErpStoreMasterRow[] | null
    return rows || []
  } catch {
    try {
      const rows = (await supabaseSelect('erp_stores', {
        select: LEGACY_SELECT_BASIC,
        order: 'sort_order.asc,display_name.asc',
        limit: 500,
      })) as ErpStoreMasterRow[] | null
      return rows || []
    } catch {
      return fetchErpStoresMaster()
    }
  }
}

function toAdminDto(row: ErpStoreMasterRow): MemberPortalStoreDto | null {
  const base = mapErpStoreToMemberPortal({ ...row, is_active: row.is_active })
  if (!base) return null
  return { ...base, isActive: row.is_active !== false }
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const rows = await fetchAllErpStoresForAdmin()
    const stores = rows
      .map(toAdminDto)
      .filter((s): s is MemberPortalStoreDto => Boolean(s))
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.displayName.localeCompare(b.displayName, 'ko')
      })
    return NextResponse.json({ success: true, stores })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '매장 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as Record<string, unknown>
    const storeCode = String(body.storeCode || '').trim()
    const displayName = String(body.displayName || '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: '매장 코드는 필수입니다.' }, { status: 400 })
    }
    if (!displayName) {
      return NextResponse.json({ success: false, message: '매장명은 필수입니다.' }, { status: 400 })
    }
    const mapQuery = String(body.mapQuery || '').trim()
    const row: Record<string, unknown> = {
      store_code: storeCode,
      display_name: displayName,
      aliases: parseAliases(body.aliases),
      sort_order: Number(body.sortOrder || 0),
      is_active: body.isActive !== false,
      photo_url: String(body.photoUrl || '').trim() || null,
      map_query: mapQuery || defaultMemberPortalMapQuery(displayName),
      address: String(body.address || '').trim() || null,
      updated_at: getBangkokDateTimeString(),
    }
    try {
      await supabaseUpsertMerge('erp_stores', 'store_code', row)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/photo_url|map_query|address|42703|column/i.test(msg)) {
        const basic = {
          store_code: row.store_code,
          display_name: row.display_name,
          aliases: row.aliases,
          sort_order: row.sort_order,
          is_active: row.is_active,
          updated_at: row.updated_at,
        }
        await supabaseUpsertMerge('erp_stores', 'store_code', basic)
      } else {
        throw e
      }
    }
    invalidateErpStoresMasterCache()
    return NextResponse.json({ success: true, storeCode })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '매장 저장에 실패했습니다.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const storeCode = new URL(req.url).searchParams.get('storeCode')?.trim() || ''
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode is required' }, { status: 400 })
    }
    await supabaseUpdateByFilter(
      'erp_stores',
      `store_code=eq.${encodeURIComponent(storeCode)}`,
      { is_active: false, updated_at: getBangkokDateTimeString() }
    )
    invalidateErpStoresMasterCache()
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '매장 비활성화에 실패했습니다.' },
      { status: 500 }
    )
  }
}
