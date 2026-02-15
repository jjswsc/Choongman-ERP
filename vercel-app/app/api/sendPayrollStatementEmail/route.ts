import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/**
 * 선택한 급여 명세서 이메일 일괄 발송.
 * Apps Script sendPayrollStatementEmailBatch와 동일 기능.
 * RESEND_API_KEY 설정 시 실제 발송, 미설정 시 준비 중 메시지 반환.
 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const monthStr = String(body?.monthStr || '').trim().slice(0, 7)
    const list = Array.isArray(body?.list) ? body.list : []
    const userStore = String(body?.userStore || '').trim()
    const userRole = (String(body?.userRole || '').toLowerCase())

    if (!monthStr || monthStr.length < 7) {
      return NextResponse.json(
        { sent: 0, failed: [], msg: '조회월이 없습니다. 먼저 조회하기를 실행해 주세요.' },
        { status: 400, headers }
      )
    }
    if (list.length === 0) {
      return NextResponse.json(
        { sent: 0, failed: [], msg: '발송할 대상이 없습니다. 행의 체크박스를 선택해 주세요.' },
        { status: 400, headers }
      )
    }

    const resendKey = (process.env.RESEND_API_KEY || '').trim()
    if (!resendKey) {
      return NextResponse.json({
        sent: 0,
        failed: list.map((r: { store?: string; name?: string }) => r.name || r.store || '?'),
        msg: '이메일 발송 기능이 아직 설정되지 않았습니다. RESEND_API_KEY를 환경 변수에 추가해 주세요. (resend.com)',
      }, { headers })
    }

    // 직원 이메일 조회 (employees 테이블)
    const employees = (await supabaseSelect('employees', { order: 'id.asc', limit: 2000 })) as { store?: string; name?: string; email?: string }[]
    const emailMap = new Map<string, string>()
    for (const e of employees || []) {
      if (e.store && e.name && e.email) {
        const key = `${String(e.store).trim()}|${String(e.name).trim()}`
        emailMap.set(key, String(e.email).trim())
      }
    }

    // 급여 데이터 조회
    const payrollRows = (await supabaseSelectFilter(
      'payroll_records',
      `month=eq.${encodeURIComponent(monthStr)}`,
      { order: 'store.asc,name.asc', limit: 1000 }
    )) as Record<string, unknown>[]

    const payrollMap = new Map<string, Record<string, unknown>>()
    for (const p of payrollRows || []) {
      const store = String(p.store || '').trim()
      const name = String(p.name || '').trim()
      if (store || name) payrollMap.set(`${store}|${name}`, p)
    }

    const sent: string[] = []
    const failed: string[] = []
    const errors: string[] = []

    for (const item of list) {
      const store = String(item?.store || '').trim()
      const name = String(item?.name || '').trim()
      const key = `${store}|${name}`
      const email = emailMap.get(key)
      const p = payrollMap.get(key)

      if (!email) {
        failed.push(name || store || '?')
        errors.push((name || store) + ': 해당 직원의 이메일이 직원정보에 등록되어 있지 않습니다.')
        continue
      }
      if (!p) {
        failed.push(name || store || '?')
        errors.push((name || store) + ': 해당 월·매장·이름의 급여 내역이 없습니다.')
        continue
      }

      try {
        const html = buildPayrollEmailHtml(p, monthStr)
        const subject = `[Payroll Statement] ${formatMonthEn(monthStr)} - ${name}`
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'onboarding@resend.dev',
            to: email,
            subject,
            html,
          }),
        })
        const data = (await res.json()) as { id?: string; message?: string; statusCode?: number }
        if (res.ok && data.id) {
          sent.push(name || store)
        } else {
          const errMsg = data.message || `HTTP ${res.status}` || '발송 실패'
          failed.push(name || store || '?')
          errors.push((name || store) + ': ' + errMsg)
          console.error('Resend API error:', res.status, errMsg, data)
        }
      } catch (e) {
        failed.push(name || store || '?')
        errors.push((name || store) + ': ' + (e instanceof Error ? e.message : String(e)))
      }
    }

    const msg = sent.length > 0
      ? `발송 완료: ${sent.length}명`
      : failed.length > 0
        ? (errors[0] || '발송 실패')
        : ''
    return NextResponse.json({
      sent: sent.length,
      failed,
      errors: errors.slice(0, 10),
      msg,
    }, { headers })
  } catch (e) {
    console.error('sendPayrollStatementEmail:', e)
    return NextResponse.json(
      {
        sent: 0,
        failed: [],
        msg: '이메일 발송 중 오류가 발생했습니다: ' + (e instanceof Error ? e.message : String(e)),
      },
      { status: 500, headers }
    )
  }
}

function formatMonthEn(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return monthStr
  const [, m] = monthStr.split('-')
  const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  return (months[parseInt(m, 10) || 0] || m) + ' ' + monthStr.slice(0, 4)
}

function buildPayrollEmailHtml(p: Record<string, unknown>, monthStr: string): string {
  const salary = Number(p.salary) || 0
  const posAllow = Number(p.pos_allow ?? p.posAllow) || 0
  const hazAllow = Number(p.haz_allow ?? p.hazAllow) || 0
  const birthBonus = Number(p.birth_bonus ?? p.birthBonus) || 0
  const holidayPay = Number(p.holiday_pay ?? p.holidayPay) || 0
  const splBonus = Number(p.spl_bonus ?? p.splBonus) || 0
  const otAmt = Number(p.ot_amt ?? p.otAmt) || 0
  const lateDed = Number(p.late_ded ?? p.lateDed) || 0
  const sso = Number(p.sso) || 0
  const tax = Number(p.tax) || 0
  const otherDed = Number(p.other_ded ?? p.otherDed) || 0
  const netPay = Number(p.net_pay ?? p.netPay) || 0
  const totalAllow = posAllow + hazAllow + birthBonus + holidayPay + splBonus
  const totalDed = lateDed + sso + tax + otherDed
  const yearMonth = formatMonthEn(monthStr)
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.5;max-width:560px;margin:0 auto;">
<div style="padding:20px;">
<h2 style="color:#0f172a;margin-bottom:8px;">Payroll Statement</h2>
<p style="color:#64748b;margin-bottom:20px;">${yearMonth} - ${p.name || ''} (${p.store || ''})</p>
<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;">
<tr style="background:#f8fafc;"><td style="padding:8px;border:1px solid #e2e8f0;"><b>Earnings</b></td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;"></td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;">Base Salary</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">${fmt(salary)} THB</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;">Position + Risk + Birth + Holiday + Bonus</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">+${fmt(totalAllow)} THB</td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;">OT</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">+${fmt(otAmt)} THB</td></tr>
<tr style="background:#fef2f2;"><td style="padding:8px;border:1px solid #e2e8f0;"><b>Deductions</b></td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;"></td></tr>
<tr><td style="padding:8px;border:1px solid #e2e8f0;">Late + SSO + Tax + Other</td><td style="padding:8px;border:1px solid #e2e8f0;text-align:right;">-${fmt(totalDed)} THB</td></tr>
<tr style="background:#e0f2fe;"><td style="padding:12px;border:1px solid #e2e8f0;"><b>Net Pay</b></td><td style="padding:12px;border:1px solid #e2e8f0;text-align:right;color:#0c4a6e;font-size:1.1em;"><b>${fmt(netPay)} THB</b></td></tr>
</table>
<p style="margin-top:24px;font-size:12px;color:#94a3b8;">CHOONGMAN ERP - Payroll</p>
</div></body></html>`
}
