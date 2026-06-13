import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert } from '@/lib/supabase-server'
import { sendFcmToRecipients, getRecipientsByTargetStoreRole } from '@/lib/firebase-admin'
import { getNotificationSettings } from '@/lib/notification-settings-server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = await request.json()
    const title = String(body?.title || '').trim()
    const content = String(body?.content || '').trim()
    let targetStore = String(body?.targetStore ?? body?.target_store ?? '전체').trim()
    const targetRole = String(body?.targetRole ?? body?.target_role ?? '전체').trim()
    const targetPermissionGroup = String(body?.targetPermissionGroup ?? body?.target_permission_group ?? '').trim() || null
    const sender = String(auth.name || body?.sender || '').trim()
    const targetRecipients = body?.targetRecipients ?? body?.target_recipients
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const allowedStores =
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .concat(userStore)
    const rawAttachments = body?.attachments
    const isUrgent = Boolean(body?.isUrgent ?? body?.is_urgent)
    const expiresAtRaw = String(body?.expiresAt ?? body?.expires_at ?? '').trim()
    const scheduledAtRaw = String(body?.scheduledAt ?? body?.scheduled_at ?? '').trim()
    let attachmentsStr = '[]'
    if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
      const sanitized = rawAttachments
        .filter((a: unknown) => a && typeof a === 'object' && 'name' in a && 'url' in a)
        .map((a: { name?: string; mime?: string; url?: string }) => ({
          name: String(a?.name ?? '').trim() || 'file',
          mime: String(a?.mime ?? '').trim() || 'application/octet-stream',
          url: String(a?.url ?? '').trim(),
        }))
        .filter((a) => a.url.length > 0)
      if (sanitized.length > 0) {
        attachmentsStr = JSON.stringify(sanitized)
      }
    }

    if (!title) {
      return NextResponse.json(
        { success: false, message: '제목을 입력해 주세요.' },
        { headers }
      )
    }

    const isScopedRole =
      !isOfficeRole(userRole) && !isAccountingRole(userRole) &&
      (userRole.includes('manager') || userRole.includes('franchisee'))
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

    const id = Date.now()
    const normalizedRecipients = Array.isArray(targetRecipients)
      ? targetRecipients
          .map((r: { store?: string; name?: string; employeeId?: number } | string) => {
            if (typeof r === 'string') {
              const raw = r.trim()
              const [s, n] = raw.split('|')
              return { store: String(s || '').trim(), name: String(n || '').trim(), employeeId: 0 }
            }
            const s = String(r?.store ?? '').trim()
            const n = String(r?.name ?? '').trim()
            const employeeId =
              r?.employeeId != null && Number.isFinite(Number(r.employeeId))
                ? Math.floor(Number(r.employeeId))
                : 0
            return { store: s, name: n, employeeId: employeeId > 0 ? employeeId : 0 }
          })
          .filter((r) => !!r.store)
      : []
    if (isScopedRole && normalizedRecipients.length > 0) {
      const outOfScope = normalizedRecipients.some(
        (r) => !allowedStores.some((s) => storesMatchForGradeLookup(s, String(r.store || '').trim()))
      )
      if (outOfScope) {
        return NextResponse.json(
          { success: false, message: '수신 대상에 허용되지 않은 매장이 포함되어 있습니다.' },
          { status: 403, headers }
        )
      }
    }
    const missingNameIds = Array.from(
      new Set(
        normalizedRecipients
          .filter((r) => r.employeeId > 0 && !r.name)
          .map((r) => r.employeeId)
      )
    )
    const nameById: Record<number, string> = {}
    if (missingNameIds.length > 0) {
      const chunks: number[][] = []
      for (let i = 0; i < missingNameIds.length; i += 80) chunks.push(missingNameIds.slice(i, i + 80))
      for (const chunk of chunks) {
        const filter = `id=in.(${chunk.join(',')})`
        const rows = (await supabaseSelectFilter('employees', filter, {
          select: 'id,name',
          limit: 1000,
          order: 'id.asc',
        })) as { id?: number; name?: string }[]
        for (const row of rows || []) {
          const id = row.id != null && Number.isFinite(Number(row.id)) ? Math.floor(Number(row.id)) : 0
          if (id > 0) nameById[id] = String(row.name || '').trim()
        }
      }
    }
    const recipientListMap = new Map<string, string>()
    for (const r of normalizedRecipients) {
      const store = String(r.store || '').trim()
      if (!store) continue
      const id = r.employeeId > 0 ? r.employeeId : 0
      const name = String(r.name || (id > 0 ? nameById[id] || '' : '')).trim()
      if (!name) continue
      const key = id > 0 ? `${store}|#${id}` : `${store}|${name}`
      recipientListMap.set(key, `${store}|${name}`)
    }
    const recipientList = Array.from(recipientListMap.values())
    const targetRecipientsStr = recipientList.length > 0 ? JSON.stringify(recipientList) : null

    const noticeRow: Record<string, unknown> = {
      id,
      title,
      content,
      target_store: targetStore,
      target_role: targetRole,
      target_recipients: targetRecipientsStr,
      sender,
      attachments: attachmentsStr,
    }
    if (targetPermissionGroup != null && targetPermissionGroup !== '') noticeRow.target_permission_group = targetPermissionGroup
    if (isUrgent) noticeRow.is_urgent = true
    if (expiresAtRaw) noticeRow.expires_at = expiresAtRaw
    if (scheduledAtRaw) noticeRow.scheduled_at = scheduledAtRaw
    try {
      await supabaseInsert('notices', noticeRow)
    } catch (colErr) {
      const errMsg = colErr instanceof Error ? colErr.message : String(colErr)
      if (/target_permission_group|column.*does not exist/i.test(errMsg)) {
        delete noticeRow.target_permission_group
        await supabaseInsert('notices', noticeRow)
      } else if (/is_urgent|expires_at|scheduled_at/i.test(errMsg)) {
        delete noticeRow.is_urgent
        delete noticeRow.expires_at
        delete noticeRow.scheduled_at
        await supabaseInsert('notices', noticeRow)
      } else {
        throw colErr
      }
    }

    const scheduledFuture =
      scheduledAtRaw && !isNaN(new Date(scheduledAtRaw).getTime()) &&
      new Date(scheduledAtRaw).getTime() > Date.now()

    // FCM 푸시 알림 (예약 시각이 미래면 노출 전이라 푸시 생략)
    let fcmRecipients: { store: string; name: string }[] = []
    if (recipientList.length > 0) {
      fcmRecipients = recipientList.map((s) => {
        const [store, name] = s.split('|')
        return { store: store || '', name: name || '' }
      })
    } else {
      fcmRecipients = await getRecipientsByTargetStoreRole(targetStore, targetRole, targetPermissionGroup ?? undefined)
    }
    let fcmResult: { sent: number; failed: number } | null = null
    if (!scheduledFuture && fcmRecipients.length > 0) {
      const settings = await getNotificationSettings()
      if (settings.pushNoticeEnabled) {
        try {
          fcmResult = await sendFcmToRecipients({
            title,
            body: content.slice(0, 100),
            recipients: fcmRecipients,
          })
          if (fcmResult.sent === 0 && fcmResult.failed === 0) {
            console.warn('sendNotice FCM: 수신자', fcmRecipients.length, '명, push_tokens 없음')
          } else {
            console.info('sendNotice FCM:', fcmResult.sent, 'sent,', fcmResult.failed, 'failed')
          }
        } catch (e) {
          console.error('sendNotice FCM:', e)
          fcmResult = { sent: 0, failed: fcmRecipients.length }
        }
      }
    }

    let message = scheduledFuture
      ? '공지가 예약되었습니다. 지정 시각 이후 수신자에게 노출됩니다.'
      : '공지사항이 등록되었습니다.'
    if (fcmResult && fcmRecipients.length > 0) {
      if (fcmResult.sent === 0 && fcmResult.failed === 0) {
        message += ` 푸시 알림: 수신자 ${fcmRecipients.length}명 중 푸시 토큰이 없습니다. 수신자가 홈 화면에서 "푸시 받기"를 등록했는지 확인하세요.`
      } else if (fcmResult.sent > 0) {
        message += ` 푸시 알림 ${fcmResult.sent}명 발송됨.`
      }
    }

    return NextResponse.json(
      { success: true, message, fcmSent: fcmResult?.sent ?? 0, fcmFailed: fcmResult?.failed ?? 0 },
      { headers }
    )
  } catch (e) {
    console.error('sendNotice:', e)
    return NextResponse.json(
      { success: false, message: '등록 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
