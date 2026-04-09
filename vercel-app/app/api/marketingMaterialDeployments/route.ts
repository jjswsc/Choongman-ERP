import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { isFranchiseeRole, isManagerRole } from '@/lib/permissions'

const ALLOWED_PLACEMENT_SPOTS = new Set(['counter', 'tv', 'table', 'entrance'])

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : s
}

function parseSpot(val: unknown): string {
  const s = String(val ?? '').trim().toLowerCase()
  if (!s) return 'counter'
  if (ALLOWED_PLACEMENT_SPOTS.has(s)) return s
  return s.slice(0, 64)
}

function normalizeStoreName(val: unknown): string {
  return String(val ?? '').trim()
}

function isStoreScopedRole(role: string): boolean {
  return isManagerRole(role) || isFranchiseeRole(role)
}

/** 홍보물 매장별 배치 이력 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()
    const materialId = searchParams.get('materialId')?.trim()
    const store = searchParams.get('store')?.trim()
    const activeOnly = searchParams.get('activeOnly') === '1'

    const filters: string[] = []
    if (campaignId) filters.push(`campaign_id=eq.${encodeURIComponent(campaignId)}`)
    if (materialId) filters.push(`material_id=eq.${encodeURIComponent(materialId)}`)
    if (store) filters.push(`store_name=eq.${encodeURIComponent(store)}`)
    if (activeOnly) filters.push('removed_on=is.null')

    const rows = (filters.length
      ? await supabaseSelectFilter('marketing_material_deployments', filters.join('&'), {
          order: 'installed_on.desc,id.desc',
          limit: 10000,
        })
      : await supabaseSelect('marketing_material_deployments', {
          order: 'installed_on.desc,id.desc',
          limit: 10000,
        })) as Record<string, unknown>[] | null

    const list = (rows || []).map((row) => ({
      id: String(row.id ?? ''),
      materialId: String(row.material_id ?? ''),
      campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
      storeName: String(row.store_name ?? ''),
      placementSpot: String(row.placement_spot ?? 'counter'),
      materialType: row.material_type != null ? String(row.material_type) : null,
      installedOn: parseDate(row.installed_on),
      removedOn: parseDate(row.removed_on),
      note: String(row.note ?? ''),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      isActive: !row.removed_on,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingMaterialDeployments GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 홍보물 매장별 배치 이력 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const body = (await req.json()) as {
      id?: string
      materialId?: string
      campaignId?: string | null
      storeName?: string
      placementSpot?: string
      materialType?: string | null
      installedOn?: string
      removedOn?: string | null
      note?: string
      userRole?: string
      userStore?: string
      user_role?: string
      user_store?: string
    }

    const editingId = String(body.id ?? '').trim()
    const materialId = String(body.materialId ?? '').trim()
    const campaignIdRaw = String(body.campaignId ?? '').trim()
    const campaignId = campaignIdRaw ? Number(campaignIdRaw) : null
    const userRole = String(body.userRole ?? body.user_role ?? '')
    const userStore = normalizeStoreName(body.userStore ?? body.user_store ?? '')
    const scopedStore = isStoreScopedRole(userRole) ? userStore : ''
    if (isStoreScopedRole(userRole) && !scopedStore) {
      return NextResponse.json(
        { success: false, message: '매니저/가맹점주 저장에는 사용자 매장 정보가 필요합니다.' },
        { headers }
      )
    }
    const requestedStoreName = String(body.storeName ?? '').trim()
    if (
      scopedStore &&
      requestedStoreName &&
      requestedStoreName.toLowerCase() !== scopedStore.toLowerCase()
    ) {
      return NextResponse.json(
        { success: false, message: `매니저/가맹점주는 본인 매장(${scopedStore})만 저장할 수 있습니다.` },
        { headers }
      )
    }
    const storeName = scopedStore || String(body.storeName ?? '').trim()
    const placementSpot = parseSpot(body.placementSpot)
    const materialType = String(body.materialType ?? '').trim() || null
    const installedOn = parseDate(body.installedOn)
    const removedOn = parseDate(body.removedOn)
    const note = String(body.note ?? '').trim()

    if (!materialId || !storeName || !installedOn) {
      return NextResponse.json(
        { success: false, message: '홍보물/매장/설치일 정보가 필요합니다.' },
        { headers }
      )
    }
    if (removedOn && removedOn < installedOn) {
      return NextResponse.json(
        { success: false, message: '철수일은 설치일보다 빠를 수 없습니다.' },
        { headers }
      )
    }

    const row: Record<string, unknown> = {
      material_id: Number(materialId),
      campaign_id: campaignId,
      store_name: storeName,
      placement_spot: placementSpot,
      material_type: materialType,
      installed_on: installedOn,
      removed_on: removedOn,
      note,
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      const existing = (await supabaseSelectFilter(
        'marketing_material_deployments',
        `id=eq.${encodeURIComponent(editingId)}`,
        { limit: 1 }
      )) as { id?: number }[] | null
      if (existing?.length) {
        await supabaseUpdateByFilter('marketing_material_deployments', `id=eq.${editingId}`, row)
        return NextResponse.json({ success: true, message: '수정되었습니다.', id: editingId }, { headers })
      }
    }

    const inserted = (await supabaseInsert('marketing_material_deployments', row)) as { id?: number }[]
    const created = Array.isArray(inserted) ? inserted[0] : inserted
    return NextResponse.json(
      { success: true, message: '저장되었습니다.', id: created?.id ? String(created.id) : null },
      { headers }
    )
  } catch (e) {
    console.error('marketingMaterialDeployments POST:', e)
    const msg = e instanceof Error ? e.message : '저장 실패'
    return NextResponse.json({ success: false, message: msg }, { headers })
  }
}
