import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import { NOTICE_LIST_COLS, NOTICE_LIST_COLS_LEGACY } from '@/lib/postgrest-narrow-select'
import { parseListPagination, slicePage, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-params'
import { isNoticeReadStatus } from '@/lib/notice-read-status'
import { isOrderRelatedNotice, isWorkLogRelatedNotice } from '@/lib/notice-read-aggregation'
import { employeeReceivesBroadcast } from '@/lib/broadcast-notice-target'
import { parseNoticeAttachments } from '@/lib/notice-recipient-estimate'
import { bangkokYmdRangeToIsoBounds } from '@/lib/bangkok-date'
import { requireAuth } from '@/lib/verify-auth'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'

const SENT_NOTICES_DB_LIMIT = 400

const TZ = 'Asia/Bangkok'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = typeof val === 'string' ? new Date(val) : val
  if (isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const timePart = d.toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${datePart} ${timePart}`
}

async function fetchNoticeRows(filter: string, tenantScope: SaasTenantScope) {
  const base = filter || 'id=gte.0'
  const tenantFilter = appendSaasTenantFilter(base, tenantScope, 'notices')
  try {
    return (await supabaseSelectFilter('notices', tenantFilter, {
      order: 'created_at.desc',
      limit: SENT_NOTICES_DB_LIMIT,
      select: NOTICE_LIST_COLS,
    })) as NoticeRow[]
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) {
      markSaasTenantColumnMissing('notices')
      return (await supabaseSelectFilter('notices', base, {
        order: 'created_at.desc',
        limit: SENT_NOTICES_DB_LIMIT,
        select: NOTICE_LIST_COLS,
      })) as NoticeRow[]
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (/is_urgent|expires_at|scheduled_at|column/i.test(msg)) {
      try {
        return (await supabaseSelectFilter('notices', tenantFilter, {
          order: 'created_at.desc',
          limit: SENT_NOTICES_DB_LIMIT,
          select: NOTICE_LIST_COLS_LEGACY,
        })) as NoticeRow[]
      } catch (e2) {
        if (isMissingSaasTenantColumnError(e2)) {
          markSaasTenantColumnMissing('notices')
          return (await supabaseSelectFilter('notices', base, {
            order: 'created_at.desc',
            limit: SENT_NOTICES_DB_LIMIT,
            select: NOTICE_LIST_COLS_LEGACY,
          })) as NoticeRow[]
        }
        throw e2
      }
    }
    throw e
  }
}

type NoticeRow = {
  id: number
  sender?: string
  title?: string
  content?: string
  target_store?: string
  target_role?: string
  target_permission_group?: string | null
  target_recipients?: string | null
  created_at?: string
  attachments?: string
  is_urgent?: boolean
  expires_at?: string | null
  scheduled_at?: string | null
}

/** 발송한 공지 목록 (sender 기준, 날짜 필터) - readCount/totalCount 포함 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authRes = await requireAuth(request, 'manager')
  if (authRes.errorResponse) {
    authRes.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authRes.errorResponse
  }
  const auth = authRes.auth

  const { searchParams } = new URL(request.url)
  const sender = String(searchParams.get('sender') || '').trim()
  const startStr = String(searchParams.get('startDate') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endDate') || searchParams.get('end') || '').trim()
  const searchType = String(searchParams.get('searchType') || 'all').toLowerCase() as 'all' | 'notice' | 'order'
  const keyword = String(searchParams.get('keyword') || searchParams.get('q') || '').trim().toLowerCase()
  const { page, pageSize } = parseListPagination(searchParams, null, 15)

  const tenantScope = await resolveSaasTenantScope({
    auth: { tenantId: auth.tenantId, company: auth.company },
    storeCode: auth.store,
  })
  if (isSaasTenantQueryBlocked(tenantScope, 'notices')) {
    return NextResponse.json(
      { items: [], total: 0, page, pageSize, truncated: false },
      { headers }
    )
  }

  const isAllSenders = sender === '' || sender.toLowerCase() === 'all' || sender === '전체'

  try {
    let filter = isAllSenders ? '' : `sender=ilike.${encodeURIComponent(sender)}`
    if (startStr && endStr) {
      const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startStr, endStr)
      filter += (filter ? '&' : '') + `created_at=gte.${gteIso}`
      filter += (filter ? '&' : '') + `created_at=lte.${lteIso}`
    } else if (startStr) {
      const { gteIso } = bangkokYmdRangeToIsoBounds(startStr, startStr)
      filter += (filter ? '&' : '') + `created_at=gte.${gteIso}`
    } else if (endStr) {
      const { lteIso } = bangkokYmdRangeToIsoBounds(endStr, endStr)
      filter += (filter ? '&' : '') + `created_at=lte.${lteIso}`
    }
    const effectiveFilter = filter || 'id=gte.0'

    const rows = await fetchNoticeRows(effectiveFilter, tenantScope)

    let empList: {
      store?: string
      name?: string
      job?: string
      role?: string
      resign_date?: string
    }[] = []
    try {
      const empFilter = appendSaasTenantFilter('id=gt.0', tenantScope, 'employees')
      empList = ((await supabaseSelectFilter('employees', empFilter, {
        order: 'id.asc',
        select: 'store,name,job,role,resign_date',
      })) || []) as typeof empList
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('employees')
        empList = ((await supabaseSelect('employees', {
          order: 'id.asc',
          select: 'store,name,job,role,resign_date',
        })) || []) as typeof empList
      } else {
        throw e
      }
    }

    const noticeIds = (rows || []).map((r) => r.id)
    const readCountByNotice: Record<number, number> = {}
    if (noticeIds.length > 0) {
      const readsBase = `notice_id=in.(${noticeIds.join(',')})`
      const readsFilter = appendSaasTenantFilter(readsBase, tenantScope, 'notice_reads')
      let allReadRows: { notice_id: number; status?: string }[] = []
      try {
        allReadRows = ((await supabaseSelectFilter('notice_reads', readsFilter, {
          limit: 10000,
          select: 'notice_id,status',
        })) || []) as typeof allReadRows
      } catch (e) {
        if (isMissingSaasTenantColumnError(e)) {
          markSaasTenantColumnMissing('notice_reads')
          allReadRows = ((await supabaseSelectFilter('notice_reads', readsBase, {
            limit: 10000,
            select: 'notice_id,status',
          })) || []) as typeof allReadRows
        } else {
          throw e
        }
      }
      for (const r of allReadRows) {
        if (!isNoticeReadStatus(String(r.status || ''))) continue
        readCountByNotice[r.notice_id] = (readCountByNotice[r.notice_id] || 0) + 1
      }
    }

    const list: {
      id: string
      sender: string
      title: string
      date: string
      recipients: string[]
      preview: string
      content: string
      readCount: number
      totalCount: number
      isUrgent: boolean
      isOrderRelated: boolean
      targetStore: string
      targetRole: string
      targetPermissionGroup: string
      attachments: Array<{ name: string; mime: string; url: string }>
      expiresAt: string
      scheduledAt: string
    }[] = []

    for (const row of rows || []) {
      const title = row.title || ''
      const content = row.content || ''
      const senderName = String(row.sender || '').trim()
      if (isWorkLogRelatedNotice(title, senderName)) continue
      const orderRel = isOrderRelatedNotice(title, content)
      if (searchType === 'order' && !orderRel) continue
      if (searchType === 'notice' && orderRel) continue

      let targetRecipientsList: string[] = []
      try {
        const raw = row.target_recipients
        if (raw && typeof raw === 'string') {
          const parsed = JSON.parse(raw) as unknown
          if (Array.isArray(parsed) && parsed.length > 0) {
            targetRecipientsList = parsed.filter((x): x is string => typeof x === 'string')
          }
        }
      } catch {
        /* ignore */
      }

      let totalCount = 0
      const recipientSet = new Set<string>()

      if (targetRecipientsList.length > 0) {
        totalCount = targetRecipientsList.length
        targetRecipientsList.forEach((s) => {
          const [store] = s.split('|')
          if (store?.trim()) recipientSet.add(store.trim())
        })
      } else {
        for (const e of empList) {
          const eStore = String(e.store || '').trim()
          const eName = String(e.name || '').trim()
          const resignDate = String(e.resign_date || '').trim()
          if (!eName || resignDate) continue
          if (!eStore || eStore === '매장명' || eStore === 'Store') continue
          if (
            employeeReceivesBroadcast(
              {
                store: eStore,
                name: eName,
                job: String(e.job || '').trim(),
                role: String(e.role || '').trim(),
              },
              row
            )
          ) {
            totalCount += 1
            recipientSet.add(eStore)
          }
        }
      }

      const readCount = readCountByNotice[row.id] || 0
      const targetStores = String(row.target_store || '전체').trim()

      let recipients: string[]
      if (targetRecipientsList.length > 0) {
        recipients = recipientSet.size > 0 ? Array.from(recipientSet).sort() : [`${totalCount}명`]
      } else if (targetStores === '전체' || !targetStores) {
        recipients = ['전체']
      } else {
        recipients = Array.from(recipientSet).sort()
        if (recipients.length === 0) {
          recipients = targetStores.split(',').map((s) => s.trim()).filter(Boolean)
        }
        if (recipients.length === 0) recipients = ['전체']
      }

      list.push({
        id: String(row.id),
        sender: senderName,
        title,
        date: toDateStr(row.created_at),
        recipients,
        preview: (content || '').slice(0, 100),
        content,
        readCount,
        totalCount,
        isUrgent: Boolean(row.is_urgent),
        isOrderRelated: orderRel,
        targetStore: targetStores,
        targetRole: String(row.target_role || '전체').trim(),
        targetPermissionGroup: String(row.target_permission_group || '').trim(),
        attachments: parseNoticeAttachments(row.attachments),
        expiresAt: row.expires_at ? toDateStr(row.expires_at) : '',
        scheduledAt: row.scheduled_at ? toDateStr(row.scheduled_at) : '',
      })
    }

    let filtered = list
    if (keyword) {
      filtered = list.filter((n) => {
        const t = (n.title || '').toLowerCase()
        const c = (n.content || '').toLowerCase()
        const p = (n.preview || '').toLowerCase()
        return t.includes(keyword) || c.includes(keyword) || p.includes(keyword)
      })
    }

    const total = filtered.length
    const truncated = (rows || []).length >= SENT_NOTICES_DB_LIMIT
    const items = slicePage(filtered, page, pageSize)

    return NextResponse.json({ items, total, page, pageSize, truncated }, { headers })
  } catch (e) {
    console.error('getSentNotices:', e)
    return NextResponse.json(
      { items: [], total: 0, page: 1, pageSize: DEFAULT_LIST_PAGE_SIZE, truncated: false },
      { headers }
    )
  }
}
