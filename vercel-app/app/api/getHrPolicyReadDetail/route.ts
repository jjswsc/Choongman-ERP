import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { employeeIsTargetedForRow, findEmployeeContextFromRoster } from '@/lib/broadcast-notice-target'

const TZ = 'Asia/Bangkok'

function toDateStr(val: string | Date | null | undefined): string {
  if (!val) return ''
  const d = typeof val === 'string' ? new Date(val) : val
  if (isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('en-CA', { timeZone: TZ })
  const timePart = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return `${datePart} ${timePart}`
}

/** 인사 규정별 열람/확인 상세 (대상= getMyHrPolicies / broadcast-notice-target 과 동일) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  const { searchParams } = new URL(request.url)
  const policyId = Number(searchParams.get('policyId') || searchParams.get('id') || 0)

  if (!policyId || isNaN(policyId)) {
    return NextResponse.json({ success: false, message: 'Invalid policyId' }, { status: 400, headers })
  }

  try {
    const prows = (await supabaseSelectFilter('hr_policies', `id=eq.${policyId}`, {
      limit: 1,
      select: 'id,target_store,target_role,target_permission_group,target_recipients,content_version',
    })) as {
      id?: number
      target_store?: string
      target_role?: string
      target_permission_group?: string
      target_recipients?: string | null
      content_version?: number
    }[]

    const pol = prows?.[0]
    if (!pol) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404, headers })
    }
    const cv = Math.max(1, Math.floor(Number(pol.content_version ?? 1)) || 1)

    const readRows = (await supabaseSelectFilter('hr_policy_reads', `policy_id=eq.${policyId}`, {
      limit: 10000,
      select: 'store,name,read_at,status,acknowledged_version',
    })) as {
      store?: string
      name?: string
      read_at?: string
      status?: string
      acknowledged_version?: number
    }[]

    const readMap: Record<string, { read_at: string; status: string; v: number }> = {}
    for (const r of readRows || []) {
      const k = `${String(r.store || '').trim()}_${String(r.name || '').trim()}`
      readMap[k] = {
        read_at: toDateStr(r.read_at),
        status: String(r.status || '확인').trim(),
        v: Math.max(0, Math.floor(Number(r.acknowledged_version ?? 0)) || 0),
      }
    }

    const items: { store: string; name: string; read_at: string; status: string; acknowledged: boolean }[] = []
    const empList = (await supabaseSelect('employees', {
      order: 'id.asc',
      select: 'store,name,job,role,resign_date',
    })) as { store?: string; name?: string; job?: string; role?: string; resign_date?: string }[]

    let targetRecipientsList: string[] = []
    try {
      const raw = pol.target_recipients
      if (raw && typeof raw === 'string') {
        const parsed = JSON.parse(raw) as unknown
        if (Array.isArray(parsed) && parsed.length > 0) {
          targetRecipientsList = parsed.filter((x): x is string => typeof x === 'string')
        }
      }
    } catch {
      /* */
    }

    if (targetRecipientsList.length > 0) {
      for (const s of targetRecipientsList) {
        const [eStore, eName] = s.split('|')
        const st = (eStore || '').trim()
        const nm = (eName || '').trim()
        if (!st || !nm) continue
        const k = `${st}_${nm}`
        const rd = readMap[k]
        const ok = rd && (rd.v || 0) >= cv
        items.push({
          store: st,
          name: nm,
          read_at: rd?.read_at || '',
          status: ok ? (rd?.status || '확인') : '미확인',
          acknowledged: Boolean(ok),
        })
      }
    } else {
      for (const e of empList || []) {
        const eStore = String(e.store || '').trim()
        const eName = String(e.name || '').trim()
        const resignDate = String(e.resign_date || '').trim()
        if (!eName || (resignDate && resignDate !== '')) continue
        if (!eStore || eStore === '매장명' || eStore === 'Store') continue
        const { myJob, myRole } = findEmployeeContextFromRoster(empList || [], eStore, eName)
        if (!employeeIsTargetedForRow(eStore, eName, myJob, myRole, pol)) continue
        const k = `${eStore}_${eName}`
        const rd = readMap[k]
        const ok = rd && (rd.v || 0) >= cv
        items.push({
          store: eStore,
          name: eName,
          read_at: rd?.read_at || '',
          status: ok ? (rd?.status || '확인') : '미확인',
          acknowledged: Boolean(ok),
        })
      }
    }

    items.sort((a, b) => {
      if (a.store !== b.store) return a.store.localeCompare(b.store)
      return a.name.localeCompare(b.name)
    })

    return NextResponse.json(
      { success: true, contentVersion: cv, items },
      { status: 200, headers }
    )
  } catch (e) {
    console.error('getHrPolicyReadDetail:', e)
    return NextResponse.json({ success: false, message: 'Failed' }, { status: 500, headers })
  }
}
