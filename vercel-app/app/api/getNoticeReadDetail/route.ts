import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  if (typeof val === 'string') return val.slice(0, 16).replace('T', ' ')
  const d = new Date(val)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16).replace('T', ' ')
}

/** 공지별 수신자 개별 수신 확인 현황 (매장, 이름, 확인일시, 상태) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const { searchParams } = new URL(request.url)
  const noticeId = Number(searchParams.get('noticeId') || searchParams.get('id') || 0)

  if (!noticeId || isNaN(noticeId)) {
    return NextResponse.json({ success: false, message: 'Invalid noticeId' }, { status: 400, headers })
  }

  try {
    const noticeRows = (await supabaseSelectFilter('notices', `id=eq.${noticeId}`, { limit: 1 })) as {
      id: number
      target_store?: string
      target_role?: string
    }[]
    const notice = noticeRows?.[0]
    if (!notice) {
      return NextResponse.json({ success: false, message: 'Notice not found' }, { status: 404, headers })
    }

    const targetStores = String(notice.target_store || '전체').trim()
    const targetRoles = String(notice.target_role || '전체').trim()
    const isAllStores = targetStores === '전체' || targetStores.trim() === ''
    const isAllRoles = targetRoles === '전체' || targetRoles.trim() === ''
    const roleList = isAllRoles
      ? []
      : targetRoles
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)

    const empList = (await supabaseSelect('employees', { order: 'id.asc' })) as {
      store?: string
      name?: string
      job?: string
      role?: string
      resign_date?: string
    }[] || []

    const readRows = (await supabaseSelectFilter(
      'notice_reads',
      `notice_id=eq.${noticeId}`,
      { limit: 1000 }
    )) as { store?: string; name?: string; read_at?: string; status?: string }[] || []

    const readMap: Record<string, { read_at: string; status: string }> = {}
    for (const r of readRows) {
      const k = `${String(r.store || '').trim()}_${String(r.name || '').trim()}`
      readMap[k] = {
        read_at: toDateStr(r.read_at),
        status: String(r.status || '확인').trim(),
      }
    }

    const items: { store: string; name: string; read_at: string; status: string }[] = []
    for (const e of empList) {
      const eStore = String(e.store || '').trim()
      const eName = String(e.name || '').trim()
      const resignDate = String(e.resign_date || '').trim()
      if (!eName || (resignDate && resignDate !== '')) continue
      if (!eStore || eStore === '매장명' || eStore === 'Store') continue
      const eRole = (String(e.job || e.role || '').trim() || 'Staff').toLowerCase()
      const storeMatch = isAllStores || targetStores.split(',').map((s) => s.trim()).includes(eStore)
      const roleMatch = isAllRoles || roleList.length === 0 || roleList.some((r) => eRole === r || eRole.indexOf(r) >= 0 || r.indexOf(eRole) >= 0)
      if (!storeMatch || !roleMatch) continue

      const k = `${eStore}_${eName}`
      const rd = readMap[k]
      items.push({
        store: eStore,
        name: eName,
        read_at: rd?.read_at || '',
        status: rd?.status || '미확인',
      })
    }

    items.sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json({ items }, { headers })
  } catch (e) {
    console.error('getNoticeReadDetail:', e)
    return NextResponse.json({ success: false, message: 'Failed' }, { status: 500, headers })
  }
}
