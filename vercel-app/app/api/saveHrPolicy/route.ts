import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'
import { HR_POLICY_LIST_COLS } from '@/lib/postgrest-narrow-select'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  isMissingSaasTenantColumnError,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  stampSaasTenantId,
} from '@/lib/saas-tenant-scope'

export const dynamic = 'force-dynamic'

function norm(s: string | null | undefined) {
  return String(s || '').trim()
}

function materialFingerprint(p: {
  title: string
  content: string
  target_store: string
  target_role: string
  target_permission_group: string
  target_recipients: string | null
  attachments: string
  effective_at: string | null
}): string {
  return JSON.stringify(p)
}

/**
 * 인사 규정 등록·수정 (본사/전체 대상 권한 — sendNotice와 유사)
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    const er = authRes.errorResponse
    er.headers.set('Access-Control-Allow-Origin', '*')
    return er
  }
  const auth = authRes.auth
  const tenantScope = await resolveSaasTenantScope({ auth })
  const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
    tableHint: 'hr_policies',
    label: '인사 규정',
  })
  if (tenantWriteErr) {
    return NextResponse.json({ success: false, message: tenantWriteErr }, { status: 403, headers })
  }
  const userRole = String(auth.role || '').toLowerCase()
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)
  const userStore = String(auth.store || '').trim()
  const allowedStores = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .concat(userStore)

  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = body.id != null && Number.isFinite(Number(body.id)) ? Math.floor(Number(body.id)) : 0
    const title = norm(String(body.title ?? ''))
    const content = String(body?.content ?? '')
    let targetStore = norm(String((body as Record<string, unknown>).targetStore ?? (body as Record<string, unknown>).target_store ?? '')) || '전체'
    const targetRole = norm(String((body as Record<string, unknown>).targetRole ?? (body as Record<string, unknown>).target_role ?? '')) || '전체'
    const targetPermissionGroup = norm(String((body as Record<string, unknown>).targetPermissionGroup ?? (body as Record<string, unknown>).target_permission_group ?? '')) || ''
    const targetRecipients = body?.targetRecipients ?? body.target_recipients
    const effectiveRaw = body?.effectiveAt ?? body?.effective_at
    const effective_at =
      effectiveRaw != null && String(effectiveRaw).trim() !== '' ? String(effectiveRaw).trim().slice(0, 10) : null
    const is_active = body?.is_active !== false && String(body?.is_active ?? 'true') !== 'false'
    const sender = norm(String((auth as { name?: string }).name || (typeof body?.sender === 'string' ? body.sender : '') || ''))
    let attachmentsStr = '[]'
    const rawAttachments = body?.attachments
    if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
      const sanitized = rawAttachments
        .filter((a: unknown) => a && typeof a === 'object' && 'name' in a && 'url' in a)
        .map((a: { name?: string; mime?: string; url?: string }) => ({
          name: String(a?.name ?? '').trim() || 'file',
          mime: String(a?.mime ?? '').trim() || 'application/octet-stream',
          url: String(a?.url ?? '').trim(),
        }))
        .filter((a) => a.url.length > 0)
      if (sanitized.length > 0) attachmentsStr = JSON.stringify(sanitized)
    }

    if (!title) {
      return NextResponse.json({ success: false, message: '제목을 입력해 주세요.' }, { headers })
    }

    const isScopedRole =
      !isOffice && (userRole.includes('manager') || userRole.includes('franchisee'))
    if (isScopedRole) {
      if (allowedStores.length === 0) {
        return NextResponse.json(
          { success: false, message: '매장 접근 권한이 없습니다.' },
          { status: 403, headers }
        )
      }
      const isAllTarget = !targetStore || targetStore === '전체' || targetStore === 'All'
      if (isAllTarget) {
        if (allowedStores.length === 1) {
          targetStore = allowedStores[0]
        } else {
          return NextResponse.json(
            { success: false, message: '허용된 매장 중 하나를 선택해 주세요.' },
            { status: 403, headers }
          )
        }
      } else {
        const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, targetStore))
        if (!allowed) {
          return NextResponse.json(
            { success: false, message: '허용되지 않은 매장 대상입니다.' },
            { status: 403, headers }
          )
        }
      }
    }

    let targetRecipientsStr: string | null = null
    if (Array.isArray(targetRecipients) && targetRecipients.length > 0) {
      const list = (targetRecipients as { store?: string; name?: string }[])
        .map((r) => `${String(r?.store || '').trim()}|${String(r?.name || '').trim()}`)
        .filter((s) => s.length > 1)
      if (isScopedRole && list.length > 0) {
        const outOfScope = list.some((line) => {
          const [st] = line.split('|')
          return !allowedStores.some((a) => storesMatchForGradeLookup(a, st.trim()))
        })
        if (outOfScope) {
          return NextResponse.json(
            { success: false, message: '수신 대상에 허용되지 않은 매장이 포함되어 있습니다.' },
            { status: 403, headers }
          )
        }
      }
      targetRecipientsStr = list.length > 0 ? JSON.stringify(list) : null
    }

    if (id > 0) {
      const existingFilter = appendSaasTenantFilter(`id=eq.${id}`, tenantScope, 'hr_policies')
      let existing: {
        id?: number
        title?: string
        content?: string
        target_store?: string
        target_role?: string
        target_permission_group?: string
        target_recipients?: string
        content_version?: number
        attachments?: string
        effective_at?: string
      }[] = []
      try {
        existing = (await supabaseSelectFilter('hr_policies', existingFilter, {
          limit: 1,
          select: HR_POLICY_LIST_COLS + ',id',
        })) as typeof existing
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('hr_policies')
          existing = (await supabaseSelectFilter('hr_policies', `id=eq.${id}`, {
            limit: 1,
            select: HR_POLICY_LIST_COLS + ',id',
          })) as typeof existing
        } else {
          throw e
        }
      }

      const old = existing?.[0]
      if (!old) {
        return NextResponse.json({ success: false, message: '해당 규정을 찾을 수 없습니다.' }, { status: 404, headers })
      }

      const next = {
        title,
        content,
        target_store: targetStore,
        target_role: targetRole,
        target_permission_group: targetPermissionGroup || null,
        target_recipients: targetRecipientsStr,
        effective_at: effective_at || null,
        is_active,
        attachments: attachmentsStr,
        sender: sender || null,
      }

      const oldFp = materialFingerprint({
        title: String(old.title || ''),
        content: String(old.content || ''),
        target_store: String(old.target_store || '전체'),
        target_role: String(old.target_role || '전체'),
        target_permission_group: String(old.target_permission_group || ''),
        target_recipients: old.target_recipients || null,
        attachments: String(old.attachments || '[]'),
        effective_at: old.effective_at ? String(old.effective_at).slice(0, 10) : null,
      })
      const newFp = materialFingerprint({
        title: next.title,
        content,
        target_store: next.target_store,
        target_role: next.target_role,
        target_permission_group: String(next.target_permission_group || ''),
        target_recipients: next.target_recipients,
        attachments: attachmentsStr,
        effective_at,
      })
      const prevV = Math.max(1, Math.floor(Number(old.content_version ?? 1)) || 1)
      const content_version = oldFp === newFp ? prevV : prevV + 1

      const patch: Record<string, unknown> = {
        ...next,
        content_version,
      }
      try {
        await supabaseUpdate('hr_policies', id, patch)
      } catch (colErr) {
        const errMsg = colErr instanceof Error ? colErr.message : String(colErr)
        if (/target_permission_group|column.*does not exist/i.test(errMsg)) {
          delete patch.target_permission_group
          await supabaseUpdate('hr_policies', id, patch)
        } else {
          throw colErr
        }
      }
      return NextResponse.json({ success: true, message: '저장되었습니다.', id, content_version }, { headers })
    }

    const row: Record<string, unknown> = stampSaasTenantId(
      {
        title,
        content,
        target_store: targetStore,
        target_role: targetRole,
        target_recipients: targetRecipientsStr,
        content_version: 1,
        effective_at: effective_at || null,
        is_active,
        attachments: attachmentsStr,
        sender: sender || null,
        ...(targetPermissionGroup ? { target_permission_group: targetPermissionGroup } : {}),
      },
      tenantScope,
      'hr_policies'
    )
    try {
      const ins = (await supabaseInsert('hr_policies', row)) as { id?: number }[] | { id?: number }
      const newId = Array.isArray(ins) ? ins[0]?.id : (ins as { id?: number })?.id
      return NextResponse.json(
        { success: true, message: '등록되었습니다.', id: newId != null ? Number(newId) : undefined, content_version: 1 },
        { headers }
      )
    } catch (colErr) {
      const errMsg = colErr instanceof Error ? colErr.message : String(colErr)
      if (isMissingSaasTenantColumnError(colErr) && 'tenant_id' in row) {
        markSaasTenantColumnMissing('hr_policies')
        const { tenant_id: _t, ...withoutTenant } = row
        const ins = (await supabaseInsert('hr_policies', withoutTenant)) as { id?: number }[] | { id?: number }
        const newId = Array.isArray(ins) ? ins[0]?.id : (ins as { id?: number })?.id
        return NextResponse.json(
          { success: true, message: '등록되었습니다.', id: newId != null ? Number(newId) : undefined, content_version: 1 },
          { headers }
        )
      }
      if (/target_permission_group|column.*does not exist/i.test(errMsg)) {
        delete row.target_permission_group
        const ins = (await supabaseInsert('hr_policies', row)) as { id?: number }[] | { id?: number }
        const newId = Array.isArray(ins) ? ins[0]?.id : (ins as { id?: number })?.id
        return NextResponse.json(
          { success: true, message: '등록되었습니다.', id: newId != null ? Number(newId) : undefined, content_version: 1 },
          { headers }
        )
      }
      throw colErr
    }
  } catch (e) {
    console.error('saveHrPolicy:', e)
    return NextResponse.json(
      { success: false, message: '저장 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
