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
    let savedDept = 'Staff'
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

    const tomorrow = new Date(date + 'T12:00:00')
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextDateStr = tomorrow.toISOString().slice(0, 10)

    for (let idx = 0; idx < logs.length; idx++) {
      const item = logs[idx]
      const progress = Number(item.progress)
      const ex = item.id
        ? ((await supabaseSelectFilter(
            'work_logs',
            `id=eq.${encodeURIComponent(String(item.id))}`,
            { limit: 1 }
          )) || []) as unknown[]
        : []
      if (progress >= 100) {
        if (ex.length > 0) {
          await supabaseUpdate('work_logs', String(item.id), {
            progress: 100,
            status: 'Finish',
          })
        } else {
          await supabaseInsert('work_logs', {
            id: date + '_' + savedName + '_' + Date.now(),
            log_date: date,
            dept: savedDept,
            name: savedName,
            content: item.content || '',
            progress: 100,
            status: 'Finish',
            priority: item.priority || '',
            manager_check: '대기',
            manager_comment: '',
          })
        }
      } else {
        if (ex.length > 0) {
          await supabaseUpdate('work_logs', String(item.id), {
            progress,
            status: 'Carry Over',
          })
        } else {
          await supabaseInsert('work_logs', {
            id: date + '_' + savedName + '_' + Date.now(),
            log_date: date,
            dept: savedDept,
            name: savedName,
            content: item.content || '',
            progress,
            status: 'Carry Over',
            priority: item.priority || '',
            manager_check: '대기',
            manager_comment: '',
          })
        }
        await supabaseInsert('work_logs', {
          id:
            nextDateStr +
            '_CARRY_' +
            Date.now() +
            Math.floor(Math.random() * 100),
          log_date: nextDateStr,
          dept: savedDept,
          name: savedName,
          content: item.content || '',
          progress,
          status: 'Continue',
          priority: item.priority || '',
          manager_check: '대기',
          manager_comment: '⚡ 이월됨 (' + date + ' 부터)',
        })
      }
    }

    return NextResponse.json(
      { success: true, message: '✅ 마감 완료!' },
      { headers }
    )
  } catch (e) {
    console.error('submitDailyClose:', e)
    return NextResponse.json(
      { success: false, message: '❌ 마감 처리 실패: ' + (e as Error).message },
      { headers }
    )
  }
}
