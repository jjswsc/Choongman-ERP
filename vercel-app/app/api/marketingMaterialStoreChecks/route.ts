import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import {
  isMarketingMaterialStoreScopedRole,
} from '@/lib/marketing-material-store-scope'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { requireAuth } from '@/lib/verify-auth'

const ALLOWED_PLACEMENT_SPOTS = new Set(['counter', 'tv', 'table', 'entrance'])

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : s
}

function parseSpot(val: unknown): string | null {
  const s = String(val ?? '').trim().toLowerCase()
  if (!s) return null
  return ALLOWED_PLACEMENT_SPOTS.has(s) ? s : null
}

function normalizeStoreName(val: unknown): string {
  return String(val ?? '').trim()
}

function isStoreScopedRole(role: string): boolean {
  return isMarketingMaterialStoreScopedRole(role)
}

function parseQty(val: unknown): number | null {
  if (val == null || val === '') return null
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

function isMissingQtyColumn(err: unknown): boolean {
  const s = String(err)
  return /quantity/i.test(s) && /42703|PGRST204|does not exist|Could not find/i.test(s)
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    materialId: String(row.material_id ?? ''),
    campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
    storeName: String(row.store_name ?? ''),
    receivedOn: parseDate(row.received_on),
    receivedBy: String(row.received_by ?? ''),
    installedOn: parseDate(row.installed_on),
    installedBy: String(row.installed_by ?? ''),
    installedPlacementSpot:
      row.installed_placement_spot != null ? String(row.installed_placement_spot) : null,
    installedPhotoUrl: String(row.installed_photo_url ?? '').trim(),
    note: String(row.note ?? ''),
    quantity: parseQty(row.quantity),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }
}

async function maybeCreateDeployment(params: {
  materialId: string
  campaignId: number | null
  storeName: string
  installedOn: string
  placementSpot: string | null
  materialType: string | null
}) {
  const { materialId, campaignId, storeName, installedOn, placementSpot, materialType } = params
  const filters = [
    `material_id=eq.${encodeURIComponent(materialId)}`,
    `store_name=eq.${encodeURIComponent(storeName)}`,
    'removed_on=is.null',
  ]
  const existing = (await supabaseSelectFilter('marketing_material_deployments', filters.join('&'), {
    limit: 1,
  })) as Record<string, unknown>[] | null
  if (existing?.length) return false

  await supabaseInsert('marketing_material_deployments', {
    material_id: Number(materialId),
    campaign_id: campaignId,
    store_name: storeName,
    placement_spot: placementSpot || 'counter',
    material_type: materialType,
    installed_on: installedOn,
    removed_on: null,
    note: '',
    updated_at: new Date().toISOString(),
  })
  return true
}

/** 매장별 홍보물 수령·설치 확인 조회 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    const userRole = String(auth.role || '')
    const userStore = normalizeStoreName(auth.store || '')
    const allowedStores = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => normalizeStoreName(s))
      .filter(Boolean)
      .concat(userStore)
    const isScopedRole = isStoreScopedRole(userRole)

    const { searchParams } = new URL(req.url)
    const campaignId = searchParams.get('campaignId')?.trim()
    const materialId = searchParams.get('materialId')?.trim()
    const store = searchParams.get('store')?.trim()

    const filters: string[] = []
    if (campaignId) filters.push(`campaign_id=eq.${encodeURIComponent(campaignId)}`)
    if (materialId) filters.push(`material_id=eq.${encodeURIComponent(materialId)}`)
    if (store) filters.push(`store_name=eq.${encodeURIComponent(store)}`)

    const rows = (filters.length
      ? await supabaseSelectFilter('marketing_material_store_checks', filters.join('&'), {
          order: 'id.asc',
          limit: 10000,
        })
      : await supabaseSelect('marketing_material_store_checks', {
          order: 'id.desc',
          limit: 10000,
        })) as Record<string, unknown>[] | null

    const list = (rows || [])
      .filter((row) => {
        if (!isScopedRole) return true
        const rowStore = normalizeStoreName(row.store_name)
        return allowedStores.some((s) => storesMatchForGradeLookup(s, rowStore))
      })
      .map(mapRow)

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('marketingMaterialStoreChecks GET:', e)
    return NextResponse.json([], { headers })
  }
}

/** 매장별 홍보물 수령·설치 확인 저장 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  try {
    const body = (await req.json()) as {
      id?: string
      materialId?: string
      campaignId?: string | null
      storeName?: string
      receivedOn?: string | null
      receivedBy?: string
      installedOn?: string | null
      installedBy?: string
      installedPlacementSpot?: string | null
      installedPhotoUrl?: string | null
      note?: string
      materialType?: string | null
      quantity?: number | null
    }

    const editingId = String(body.id ?? '').trim()
    const materialId = String(body.materialId ?? '').trim()
    const campaignIdRaw = String(body.campaignId ?? '').trim()
    const campaignId = campaignIdRaw ? Number(campaignIdRaw) : null
    const userRole = String(auth.role || '')
    const userName = String(auth.name || '').trim()
    const userStore = normalizeStoreName(auth.store || '')
    const allowedStores = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => normalizeStoreName(s))
      .filter(Boolean)
      .concat(userStore)
    const scopedStore = isStoreScopedRole(userRole) ? userStore : ''
    if (isStoreScopedRole(userRole) && !scopedStore) {
      return NextResponse.json(
        { success: false, message: '매장 직원 저장에는 사용자 매장 정보가 필요합니다.' },
        { headers }
      )
    }

    const requestedStoreName = normalizeStoreName(body.storeName)
    if (scopedStore && requestedStoreName && !storesMatchForGradeLookup(scopedStore, requestedStoreName)) {
      return NextResponse.json(
        { success: false, message: `본인 매장(${scopedStore})만 저장할 수 있습니다.` },
        { status: 403, headers }
      )
    }
    const storeName = scopedStore || requestedStoreName
    if (isStoreScopedRole(userRole)) {
      const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, storeName))
      if (!allowed) {
        return NextResponse.json(
          { success: false, message: '본인 권한 매장만 저장할 수 있습니다.' },
          { status: 403, headers }
        )
      }
    }

    if (!materialId || !storeName) {
      return NextResponse.json(
        { success: false, message: '홍보물 ID와 매장명이 필요합니다.' },
        { headers }
      )
    }

    const materialRows = (await supabaseSelectFilter(
      'marketing_materials',
      `id=eq.${encodeURIComponent(materialId)}`,
      { limit: 1, select: 'id,produced_on,branches,is_hq_wide' }
    )) as Record<string, unknown>[] | null
    const materialRow = materialRows?.[0]
    if (!materialRow) {
      return NextResponse.json(
        { success: false, message: '홍보물을 찾을 수 없습니다.' },
        { headers }
      )
    }

    const priorRows = editingId
      ? ((await supabaseSelectFilter(
          'marketing_material_store_checks',
          `id=eq.${encodeURIComponent(editingId)}`,
          { limit: 1 }
        )) as Record<string, unknown>[] | null)
      : ((await supabaseSelectFilter(
          'marketing_material_store_checks',
          `material_id=eq.${encodeURIComponent(materialId)}&store_name=eq.${encodeURIComponent(storeName)}`,
          { limit: 1 }
        )) as Record<string, unknown>[] | null)
    const priorRow = priorRows?.[0] ?? null

    const hasReceivedField = body.receivedOn !== undefined
    const hasInstalledField = body.installedOn !== undefined
    const hasPlacementField = body.installedPlacementSpot !== undefined
    const hasPhotoField = body.installedPhotoUrl !== undefined

    const receivedOn = hasReceivedField
      ? parseDate(body.receivedOn)
      : parseDate(priorRow?.received_on)
    const installedOn = hasInstalledField
      ? parseDate(body.installedOn)
      : parseDate(priorRow?.installed_on)
    const installedPlacementSpot = hasPlacementField
      ? parseSpot(body.installedPlacementSpot)
      : priorRow?.installed_placement_spot != null
        ? parseSpot(priorRow.installed_placement_spot)
        : null
    const installedPhotoUrl = hasPhotoField
      ? String(body.installedPhotoUrl ?? '').trim()
      : String(priorRow?.installed_photo_url ?? '').trim()

    const producedOn = parseDate(materialRow.produced_on)
    if ((receivedOn || installedOn) && !producedOn) {
      return NextResponse.json(
        { success: false, message: '본사 제작 완료 후에 수령·설치 확인할 수 있습니다.' },
        { headers }
      )
    }

    const note =
      body.note !== undefined ? String(body.note ?? '').trim() : String(priorRow?.note ?? '').trim()
    const hasQtyField = body.quantity !== undefined
    const quantity = hasQtyField ? parseQty(body.quantity) : parseQty(priorRow?.quantity)

    if (installedOn && !receivedOn) {
      return NextResponse.json(
        { success: false, message: '설치 확인 전에 수령 확인이 필요합니다.' },
        { headers }
      )
    }

    const row: Record<string, unknown> = {
      material_id: Number(materialId),
      campaign_id: campaignId,
      store_name: storeName,
      received_on: receivedOn,
      received_by: receivedOn
        ? String(
            body.receivedBy ??
              (hasReceivedField ? userName : String(priorRow?.received_by ?? userName))
          ).trim()
        : '',
      installed_on: installedOn,
      installed_by: installedOn
        ? String(
            body.installedBy ??
              (hasInstalledField ? userName : String(priorRow?.installed_by ?? userName))
          ).trim()
        : '',
      installed_placement_spot: installedPlacementSpot,
      installed_photo_url: installedPhotoUrl,
      note,
      updated_at: new Date().toISOString(),
    }
    if (hasQtyField || quantity != null) {
      row.quantity = quantity
    }

    const writeRow = async (
      payload: Record<string, unknown>
    ): Promise<{ ok: true; id: string } | { ok: false; missing: true }> => {
      if (editingId) {
        const existing = (await supabaseSelectFilter(
          'marketing_material_store_checks',
          `id=eq.${encodeURIComponent(editingId)}`,
          { limit: 1 }
        )) as { id?: number }[] | null
        if (!existing?.length) {
          return { ok: false, missing: true }
        }
        await supabaseUpdateByFilter('marketing_material_store_checks', `id=eq.${editingId}`, payload)
        return { ok: true, id: editingId }
      }
      if (priorRow?.id != null) {
        const id = String(priorRow.id)
        await supabaseUpdateByFilter('marketing_material_store_checks', `id=eq.${id}`, payload)
        return { ok: true, id }
      }
      const inserted = (await supabaseInsert('marketing_material_store_checks', payload)) as {
        id?: number
      }[]
      const created = Array.isArray(inserted) ? inserted[0] : inserted
      return { ok: true, id: created?.id != null ? String(created.id) : '' }
    }

    let written: { ok: true; id: string } | { ok: false; missing: true }
    try {
      written = await writeRow(row)
    } catch (err) {
      if (!isMissingQtyColumn(err) || !('quantity' in row)) throw err
      const { quantity: _qty, ...rest } = row
      written = await writeRow(rest)
    }
    if (!written.ok) {
      return NextResponse.json({ success: false, message: '수정할 항목을 찾을 수 없습니다.' }, { headers })
    }
    const recordId = written.id

    if (!recordId) {
      return NextResponse.json(
        { success: false, message: '저장 후 ID를 확인할 수 없습니다.' },
        { headers }
      )
    }

    let deploymentCreated = false
    if (installedOn) {
      const effReceived =
        receivedOn ||
        parseDate(
          (
            (await supabaseSelectFilter(
              'marketing_material_store_checks',
              `id=eq.${encodeURIComponent(recordId)}`,
              { limit: 1 }
            )) as Record<string, unknown>[] | null
          )?.[0]?.received_on
        )
      if (effReceived) {
        deploymentCreated = await maybeCreateDeployment({
          materialId,
          campaignId,
          storeName,
          installedOn,
          placementSpot: installedPlacementSpot,
          materialType: String(body.materialType ?? '').trim() || null,
        })
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: editingId ? '수정되었습니다.' : '저장되었습니다.',
        id: recordId,
        deploymentCreated,
      },
      { headers }
    )
  } catch (e) {
    console.error('marketingMaterialStoreChecks POST:', e)
    const msg = e instanceof Error ? e.message : '저장 실패'
    return NextResponse.json({ success: false, message: msg }, { headers })
  }
}
