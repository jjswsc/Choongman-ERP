/**
 * 인플루언서 명부(marketing_influencer_profiles) 조회·저장 — 캠페인과 무관
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isSaasTenantQueryBlocked,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'
import {
  normalizeProfileInput,
  profileFieldsToRow,
  profileRowToApi,
} from '@/lib/marketing-influencer-profile-db'

const TABLE = 'marketing_influencer_profiles'

function isMissingTableError(e: unknown): boolean {
  const s = String(e)
  return s.includes('42P01') || s.includes('PGRST205') || /relation .* does not exist/i.test(s)
}

const MISSING_TABLE_MESSAGE =
  '인플루언서 명부 테이블이 없습니다. sql/marketing_influencer_profiles_01_table.sql ~ 03 을 Supabase에서 실행해 주세요.'

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const tenantScope = await resolveSaasTenantScope({ auth: authResult.auth })
  if (isSaasTenantQueryBlocked(tenantScope, TABLE)) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(TABLE, appendSaasTenantFilter('id=gt.0', tenantScope, TABLE), {
      order: 'updated_at.desc,id.desc',
      limit: 5000,
    })) as Record<string, unknown>[]
    return NextResponse.json((rows || []).map(profileRowToApi), { headers })
  } catch (e) {
    if (isMissingTableError(e)) {
      headers.set('X-Influencer-Profiles-Missing', '1')
      return NextResponse.json([], { headers })
    }
    console.error('marketingInfluencerProfiles GET:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(req, 'manager')
  if (authResult.errorResponse) return authResult.errorResponse
  const auth = authResult.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  const tenantError = assertSaasTenantWritable(tenantScope, { tableHint: TABLE, label: '인플루언서 명부' })
  if (tenantError) return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })

  try {
    const body = (await req.json()) as Record<string, unknown>
    const editingId = String(body.id ?? '').trim()
    const fields = normalizeProfileInput(body)
    if (!fields.displayName) {
      return NextResponse.json({ success: false, message: '이름 또는 TikTok 계정이 필요합니다.' }, { headers })
    }

    if (fields.tiktokHandle) {
      const dup = (await supabaseSelectFilter(
        TABLE,
        appendSaasTenantFilter(`tiktok_handle=ilike.${encodeURIComponent(fields.tiktokHandle)}`, tenantScope, TABLE),
        { select: 'id,display_name', limit: 2 }
      )) as { id?: number; display_name?: string }[]
      const other = (dup || []).find((d) => String(d.id) !== editingId)
      if (other) {
        return NextResponse.json(
          {
            success: false,
            message: `같은 TikTok 계정(@${fields.tiktokHandle})이 이미 명부에 있습니다: ${other.display_name || other.id}`,
            duplicateId: String(other.id),
          },
          { headers }
        )
      }
    }

    const row = {
      ...profileFieldsToRow(fields),
      updated_at: new Date().toISOString(),
    }

    if (editingId) {
      await supabaseUpdateByFilter(
        TABLE,
        appendSaasTenantFilter(`id=eq.${encodeURIComponent(editingId)}`, tenantScope, TABLE),
        row
      )
      return NextResponse.json({ success: true, id: editingId, message: '수정되었습니다.' }, { headers })
    }

    const inserted = (await supabaseInsert(
      TABLE,
      stampSaasTenantId({ ...row, created_by: String(auth.name || '').trim() }, tenantScope, TABLE)
    )) as { id?: number }[]
    const id = Array.isArray(inserted) && inserted[0]?.id != null ? String(inserted[0].id) : ''
    return NextResponse.json({ success: true, id, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ success: false, message: MISSING_TABLE_MESSAGE }, { headers })
    }
    console.error('marketingInfluencerProfiles POST:', e)
    return NextResponse.json({ success: false, message: e instanceof Error ? e.message : '저장 실패' }, { headers })
  }
}
