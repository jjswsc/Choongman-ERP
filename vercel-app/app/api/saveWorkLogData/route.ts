import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
} from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await req.json()) || {}
    const date = String(body.date || '').trim()
    const name = String(body.name || '').trim()
    const logs = Array.isArray(body.logs)
      ? body.logs
      : body.jsonStr
        ? JSON.parse(body.jsonStr)
        : []

    const staffList = ((await supabaseSelect('employees', {
      order: 'id.asc',
    })) || []) as { name?: string; nick?: string; job?: string }[]
    let savedName = name
    let savedDept = '기타'
    const sk = name.toLowerCase().replace(/\s+/g, '')
    for (let i = 0; i < staffList.length; i++) {
      const fn = String(staffList[i].name || '').toLowerCase().replace(/\s+/g, '')
      const nn = String(staffList[i].nick || '').toLowerCase().replace(/\s+/g, '')
      if (
        sk.includes(fn) ||
        fn.includes(sk) ||
        (nn && sk.includes(nn))
      ) {
        savedName =
          staffList[i].nick && String(staffList[i].nick).trim()
            ? staffList[i].nick!
            : staffList[i].name!
        savedDept = staffList[i].job || 'Staff'
        break
      }
    }

    for (let idx = 0; idx < logs.length; idx++) {
      const item = logs[idx]
      const pv = Number(item.progress)
      const status =
        pv >= 100 ? 'Finish' : item.type === 'continue' ? 'Continue' : 'Today'
      const ex = item.id
        ? ((await supabaseSelectFilter(
            'work_logs',
            `id=eq.${encodeURIComponent(String(item.id))}`,
            { limit: 1 }
          )) || []) as unknown[]
        : []
      const patch = {
        dept: savedDept,
        name: savedName,
        content: item.content || '',
        progress: pv,
        status,
        priority: item.priority || '',
      }
      if (ex.length > 0) {
        await supabaseUpdate('work_logs', String(item.id), patch)
      } else {
        await supabaseInsert('work_logs', {
          id:
            date +
            '_' +
            savedName +
            '_' +
            Date.now() +
            '_' +
            Math.floor(Math.random() * 100),
          log_date: date,
          dept: savedDept,
          name: savedName,
          content: item.content || '',
          progress: pv,
          status,
          priority: item.priority || '',
          manager_check: '대기',
          manager_comment: '',
        })
      }
    }

    return NextResponse.json(
      { success: true, messageKey: 'workLogSaveDone' },
      { headers }
    )
  } catch (e) {
    console.error('saveWorkLogData:', e)
    return NextResponse.json(
      { success: false, messageKey: 'workLogSaveFail' },
      { headers }
    )
  }
}
